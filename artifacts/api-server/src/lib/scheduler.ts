import { getAdminFirestore } from "./firebase-admin.js";
import { chargeAuthorization } from "./paystack.js";
import { updateHpDueStatuses, processHpCharges } from "./hp-scheduler.js";

// ── Retry configuration ────────────────────────────────────────────────────────
// MAX_RETRY_ATTEMPTS = 3 means 3 retries after the initial failure = 4 total charge attempts.
const MAX_RETRY_ATTEMPTS = 3;
// Days to wait before each successive retry (indexed by retryCount after failure):
//   retryCount 1 → wait 1 day, retryCount 2 → wait 3 days, retryCount 3 → exhausted
const RETRY_INTERVALS_DAYS = [1, 3, 7];

let lastRunDate = "";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoTimestamp: string, days: number): string {
  const d = new Date(isoTimestamp);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── Mark loan as defaulted if any installment has exhausted all retries ────────
async function checkAndMarkDefaulted(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offerRef: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: any,
  now: string
): Promise<void> {
  const db = getAdminFirestore();
  const allSnap = await offerRef.collection("repayments").get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasFailedInstallment = allSnap.docs.some((d: any) => d.data().status === "failed");
  if (!hasFailedInstallment) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paidCount = (allSnap.docs as any[]).filter((d: any) => d.data().status === "paid").length;
  const totalInstallments = allSnap.docs.length;
  const principal = Number(offer.principal).toLocaleString();

  await offerRef.update({ status: "defaulted", defaultedAt: now });
  console.log(
    `[scheduler] ⚠ Offer ${offerRef.id} DEFAULTED — at least one installment exhausted all retries. ` +
      `${paidCount}/${totalInstallments} installments were collected.`
  );

  const base = { offerId: offerRef.id, createdAt: now, read: false };

  db.collection("users")
    .doc(offer.wholesalerUid)
    .collection("notifications")
    .doc(`defaulted-${offerRef.id}`)
    .set({
      ...base,
      id: `defaulted-${offerRef.id}`,
      type: "loan_defaulted",
      title: "Loan defaulted",
      body:
        `${offer.retailerName}'s loan of KES ${principal} has been marked as defaulted. ` +
        `${paidCount} of ${totalInstallments} installments were collected before retries were exhausted.`,
    })
    .catch(() => {});

  db.collection("users")
    .doc(offer.retailerUid)
    .collection("notifications")
    .doc(`defaulted-${offerRef.id}`)
    .set({
      ...base,
      id: `defaulted-${offerRef.id}`,
      type: "loan_defaulted",
      title: "Loan in default",
      body:
        `Your loan of KES ${principal} has been marked as defaulted after repeated failed repayment attempts. ` +
        `Please contact support immediately.`,
    })
    .catch(() => {});
}

// ── Apply retry logic to a failed installment ─────────────────────────────────
// Exported so the webhook safety-net can call the same logic.
export async function applyRetryLogic(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offerRef: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repayRef: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repay: any,
  failureReason: string,
  now: string
): Promise<void> {
  const db = getAdminFirestore();
  const currentRetryCount = Number(repay.retryCount ?? 0);
  const newRetryCount = currentRetryCount + 1;
  const retriesExhausted = newRetryCount >= MAX_RETRY_ATTEMPTS;

  if (retriesExhausted) {
    // ── All retries exhausted → permanent failure ─────────────────────────
    await repayRef.update({
      status: "failed",
      retryCount: newRetryCount,
      failureReason,
      lastFailedAt: now,
      nextRetryAt: null,
      retriesExhausted: true,
      processingStartedAt: null,
    });

    console.error(
      `[scheduler] ✗ Installment #${repay.installmentNumber} PERMANENTLY FAILED — ` +
        `${newRetryCount}/${MAX_RETRY_ATTEMPTS} retries exhausted: ${failureReason}`
    );

    const notifBase = {
      offerId: offerRef.id,
      installmentNumber: repay.installmentNumber,
      createdAt: now,
      read: false,
    };

    db.collection("users")
      .doc(offer.retailerUid)
      .collection("notifications")
      .doc(`failed-final-${offerRef.id}-${repay.installmentNumber}`)
      .set({
        ...notifBase,
        id: `failed-final-${offerRef.id}-${repay.installmentNumber}`,
        type: "repayment_failed_final",
        title: "Repayment permanently failed",
        body:
          `All ${newRetryCount} retry attempts for installment #${repay.installmentNumber} ` +
          `of KES ${Number(repay.amount).toLocaleString()} have been exhausted. ` +
          `Reason: ${failureReason}. Your loan is now in default — please contact support.`,
      })
      .catch(() => {});

    db.collection("users")
      .doc(offer.wholesalerUid)
      .collection("notifications")
      .doc(`failed-final-${offerRef.id}-${repay.installmentNumber}`)
      .set({
        ...notifBase,
        id: `failed-final-${offerRef.id}-${repay.installmentNumber}`,
        type: "repayment_failed_final",
        title: "Repayment retries exhausted",
        body:
          `${offer.retailerName}'s installment #${repay.installmentNumber} of ` +
          `KES ${Number(repay.amount).toLocaleString()} has permanently failed after ` +
          `${newRetryCount} retries. Reason: ${failureReason}.`,
      })
      .catch(() => {});

    // Check whether the offer should now be marked defaulted
    await checkAndMarkDefaulted(offerRef, offer, now);
  } else {
    // ── Schedule next retry ───────────────────────────────────────────────
    const daysToWait = RETRY_INTERVALS_DAYS[currentRetryCount] ?? 7;
    const nextRetryAt = addDays(now, daysToWait);
    const totalAttempts = MAX_RETRY_ATTEMPTS + 1; // initial + retries

    await repayRef.update({
      status: "due",
      retryCount: newRetryCount,
      failureReason,
      lastFailedAt: now,
      nextRetryAt,
      processingStartedAt: null,
    });

    console.error(
      `[scheduler] ✗ Installment #${repay.installmentNumber} failed ` +
        `(attempt ${newRetryCount + 1}/${totalAttempts}): ${failureReason} — next retry: ${nextRetryAt}`
    );

    const notifBase = {
      offerId: offerRef.id,
      installmentNumber: repay.installmentNumber,
      retryCount: newRetryCount,
      nextRetryAt,
      createdAt: now,
      read: false,
    };

    db.collection("users")
      .doc(offer.retailerUid)
      .collection("notifications")
      .doc(`failed-${offerRef.id}-${repay.installmentNumber}-r${newRetryCount}`)
      .set({
        ...notifBase,
        id: `failed-${offerRef.id}-${repay.installmentNumber}-r${newRetryCount}`,
        type: "repayment_failed",
        title: "Repayment failed — retry scheduled",
        body:
          `Installment #${repay.installmentNumber} of KES ${Number(repay.amount).toLocaleString()} failed: ${failureReason}. ` +
          `We will retry automatically on ${nextRetryAt}. ` +
          `${MAX_RETRY_ATTEMPTS - newRetryCount} attempt(s) remaining.`,
      })
      .catch(() => {});

    db.collection("users")
      .doc(offer.wholesalerUid)
      .collection("notifications")
      .doc(`failed-${offerRef.id}-${repay.installmentNumber}-r${newRetryCount}`)
      .set({
        ...notifBase,
        id: `failed-${offerRef.id}-${repay.installmentNumber}-r${newRetryCount}`,
        type: "repayment_failed",
        title: "Repayment attempt failed",
        body:
          `${offer.retailerName}'s installment #${repay.installmentNumber} of ` +
          `KES ${Number(repay.amount).toLocaleString()} failed: ${failureReason}. ` +
          `Retry scheduled for ${nextRetryAt} (${MAX_RETRY_ATTEMPTS - newRetryCount} attempt(s) remaining).`,
      })
      .catch(() => {});
  }
}

// ── Process a single installment (with idempotency lock) ──────────────────────
export async function processInstallment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offerRef: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repayRef: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repay: any
): Promise<void> {
  const db = getAdminFirestore();

  // Acquire processing lock via Firestore transaction
  try {
    await db.runTransaction(async (tx) => {
      const snap = (await tx.get(repayRef)) as unknown as {
        exists: boolean;
        data(): Record<string, unknown> | undefined;
      };
      if (!snap.exists) throw new Error("Document not found");
      const status = snap.data()?.["status"];
      if (status !== "due") throw new Error(`Not chargeable: status=${status}`);
      tx.update(repayRef, {
        status: "processing",
        processingStartedAt: new Date().toISOString(),
      });
    });
  } catch (e) {
    console.log(
      `[scheduler] Skip installment #${repay.installmentNumber} (offer ${offerRef.id}): ${
        e instanceof Error ? e.message : e
      }`
    );
    return;
  }

  // Fetch retailer's saved Paystack auth
  const retailerSnap = await db.collection("users").doc(offer.retailerUid).get();
  const retailerData = retailerSnap.data();
  const authCode = retailerData?.paystackAuth?.authorization_code as string | undefined;
  const reusable = retailerData?.paystackAuth?.reusable as boolean | undefined;

  if (!authCode || !reusable) {
    // Auth missing is a non-retryable config error — reset to due without consuming a retry slot
    await repayRef.update({
      status: "due",
      failureReason: "No valid reusable Paystack authorization found for retailer",
      lastFailedAt: new Date().toISOString(),
      processingStartedAt: null,
    });
    console.error(
      `[scheduler] Retailer ${offer.retailerUid} has no reusable Paystack auth — installment #${repay.installmentNumber} skipped (no retry consumed)`
    );
    return;
  }

  const splitCode = (offer.splitCode as string | null | undefined) ?? null;
  const splitWholesalerUid = (offer.splitWholesalerUid as string | undefined) ?? offer.wholesalerUid;

  // Safety guard: confirm the split was created for THIS offer's wholesaler
  if (splitCode && splitWholesalerUid !== offer.wholesalerUid) {
    console.error(
      `[scheduler] ⚠ MISMATCH — offer ${offerRef.id}: split ${splitCode} was created for wholesaler ${splitWholesalerUid} but offer.wholesalerUid is ${offer.wholesalerUid}. Aborting charge.`
    );
    await repayRef.update({ status: "due", processingStartedAt: null });
    return;
  }

  console.log(
    `[scheduler] Charging KES ${repay.amount} — installment #${repay.installmentNumber} of offer ${offerRef.id}` +
      ` | wholesaler: ${offer.wholesalerUid as string}` +
      `${splitCode ? ` | split: ${splitCode} (90% → ${splitWholesalerUid})` : " | no split — subaccount pending"}` +
      (repay.retryCount ? ` | retry #${repay.retryCount}` : "")
  );

  const result = await chargeAuthorization(
    offer.retailerEmail,
    repay.amount,
    authCode,
    {
      offerId: offerRef.id as string,
      installmentNumber: repay.installmentNumber as number,
      retailerUid: offer.retailerUid as string,
      wholesalerUid: offer.wholesalerUid as string,
      dueDate: repay.dueDate as string,
    },
    splitCode
  );

  const now = new Date().toISOString();

  if (result.success) {
    // ── Success ───────────────────────────────────────────────────────────
    const totalAmount = Number(repay.amount);
    const wholesalerShare = Math.round(totalAmount * 0.9 * 100) / 100;
    const platformShare = Math.round((totalAmount - wholesalerShare) * 100) / 100;
    const settlementStatus = splitCode ? "settled" : "pending_subaccount";

    await repayRef.update({
      status: "paid",
      paidAt: now,
      paystackReference: result.reference,
      processingStartedAt: null,
      failureReason: null,
      splitCode: splitCode ?? null,
      wholesalerShare,
      platformShare,
      settlementStatus,
      settlementAt: splitCode ? now : null,
    });

    console.log(
      `[scheduler] ✓ Installment #${repay.installmentNumber} PAID (ref: ${result.reference}) — wholesaler: KES ${wholesalerShare}, platform: KES ${platformShare}, status: ${settlementStatus}`
    );

    // Notify wholesaler
    db.collection("users")
      .doc(offer.wholesalerUid)
      .collection("notifications")
      .doc(`paid-${offerRef.id}-${repay.installmentNumber}`)
      .set({
        id: `paid-${offerRef.id}-${repay.installmentNumber}`,
        type: "repayment_received",
        title: "Repayment received",
        body:
          `${offer.retailerName} paid installment #${repay.installmentNumber} of KES ${totalAmount.toLocaleString()}. ` +
          `Your share: KES ${wholesalerShare.toLocaleString()}${splitCode ? " — settled to your account." : " — pending (no subaccount configured)."}`,
        offerId: offerRef.id,
        installmentNumber: repay.installmentNumber,
        wholesalerShare,
        platformShare,
        settlementStatus,
        paystackReference: result.reference,
        createdAt: now,
        read: false,
      })
      .catch(() => {});

    // Check if this was the final installment
    const allSnap = await offerRef.collection("repayments").get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPaid = allSnap.docs.length > 0 && allSnap.docs.every((d: any) => d.data().status === "paid");

    if (allPaid) {
      const totalWholesalerEarnings = (allSnap.docs as any[]).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, d: any) => sum + (Number(d.data().wholesalerShare) || 0),
        0
      );
      await offerRef.update({ status: "completed", completedAt: now });
      console.log(`[scheduler] ★ Offer ${offerRef.id} FULLY REPAID — marking completed`);

      const completedNote = { offerId: offerRef.id, createdAt: now, read: false };

      db.collection("users")
        .doc(offer.wholesalerUid)
        .collection("notifications")
        .doc(`completed-${offerRef.id}`)
        .set({
          ...completedNote,
          id: `completed-${offerRef.id}`,
          type: "loan_completed",
          title: "Loan fully repaid",
          body:
            `${offer.retailerName}'s loan of KES ${Number(offer.principal).toLocaleString()} has been fully repaid. ` +
            `All ${offer.installments} installments settled. Total earnings: KES ${totalWholesalerEarnings.toLocaleString()}.`,
        })
        .catch(() => {});

      db.collection("users")
        .doc(offer.retailerUid)
        .collection("notifications")
        .doc(`completed-${offerRef.id}`)
        .set({
          ...completedNote,
          id: `completed-${offerRef.id}`,
          type: "loan_completed",
          title: "Loan fully repaid — Congratulations!",
          body: `You have fully repaid your loan of KES ${Number(offer.principal).toLocaleString()}. All ${offer.installments} installments have been settled.`,
        })
        .catch(() => {});
    }
  } else {
    // ── Failure: apply retry schedule ─────────────────────────────────────
    await applyRetryLogic(offerRef, repayRef, offer, repay, result.error ?? "Charge failed", now);
  }
}

// ── Update upcoming → due statuses + recover stuck 'processing' locks ─────────
export async function updateDueStatuses(): Promise<void> {
  const db = getAdminFirestore();
  const todayStr = todayISO();

  const offersSnap = await db
    .collection("loan_offers")
    .where("status", "==", "active")
    .get();

  for (const offerDoc of offersSnap.docs) {
    const batch = db.batch();
    let changed = false;

    // Mark upcoming → due
    const upcomingSnap = await offerDoc.ref
      .collection("repayments")
      .where("status", "==", "upcoming")
      .get();

    for (const doc of upcomingSnap.docs) {
      if ((doc.data().dueDate as string) <= todayStr) {
        batch.update(doc.ref, { status: "due" });
        changed = true;
      }
    }

    // Recover stuck 'processing' locks older than 10 minutes (server crash recovery)
    const processingSnap = await offerDoc.ref
      .collection("repayments")
      .where("status", "==", "processing")
      .get();

    for (const doc of processingSnap.docs) {
      const startedAt = doc.data().processingStartedAt as string | undefined;
      if (startedAt && Date.now() - new Date(startedAt).getTime() > 10 * 60 * 1000) {
        batch.update(doc.ref, { status: "due", processingStartedAt: null });
        changed = true;
        console.log(`[scheduler] Recovered stuck processing lock on installment ${doc.id}`);
      }
    }

    if (changed) await batch.commit();
  }
}

// ── Process all due charges ────────────────────────────────────────────────────
async function processCharges(): Promise<void> {
  const db = getAdminFirestore();
  const todayStr = todayISO();

  const offersSnap = await db
    .collection("loan_offers")
    .where("status", "==", "active")
    .get();

  console.log(`[scheduler] Processing charges for ${offersSnap.docs.length} active loan(s)`);

  for (const offerDoc of offersSnap.docs) {
    const offer = offerDoc.data();
    const dueSnap = await offerDoc.ref
      .collection("repayments")
      .where("status", "==", "due")
      .get();

    // Filter to only those where nextRetryAt has passed (or was never set = first attempt).
    // This enforces the retry schedule: a failed repayment won't be re-charged until
    // the configured number of days have elapsed since the last failure.
    const chargeable = dueSnap.docs.filter((doc) => {
      const nextRetryAt = doc.data().nextRetryAt as string | null | undefined;
      return !nextRetryAt || nextRetryAt <= todayStr;
    });

    const deferred = dueSnap.docs.length - chargeable.length;
    if (deferred > 0) {
      console.log(
        `[scheduler] Offer ${offerDoc.id}: ${chargeable.length} ready, ${deferred} deferred (retry date not reached)`
      );
    }

    for (const repayDoc of chargeable) {
      await processInstallment(offerDoc.ref, repayDoc.ref, offer, repayDoc.data());
    }
  }
}

// ── Scheduler entry point ──────────────────────────────────────────────────────
export function startScheduler(): void {
  const startupHour = new Date().getUTCHours();
  const startupDate = todayISO();

  // Always update statuses immediately at startup
  updateDueStatuses().catch((e) =>
    console.error("[scheduler] Startup status update error:", e)
  );
  updateHpDueStatuses().catch((e) =>
    console.error("[scheduler] Startup HP status update error:", e)
  );

  // Catch-up: if the server starts after the 05:00 UTC charge window and today's
  // job hasn't run yet, fire the charge cycle immediately instead of waiting until
  // tomorrow. This covers server restarts that happen between 05:01–23:59 UTC.
  if (startupHour >= 5 && lastRunDate !== startupDate) {
    lastRunDate = startupDate;
    console.log(
      `[scheduler] ── Catch-up repayment job starting (server started at UTC hour ${startupHour}, missed 05:00 window) ──`
    );
    updateDueStatuses()
      .then(() => updateHpDueStatuses())
      .then(() => processCharges())
      .then(() => processHpCharges())
      .then(() => console.log("[scheduler] ── Catch-up repayment job complete ──"))
      .catch((e) => {
        console.error("[scheduler] Catch-up job error:", e);
        lastRunDate = ""; // Allow retry on next hourly tick
      });
  }

  // Run every hour.
  // At 05:00 UTC (08:00 EAT): run full charge cycle (once per calendar day).
  // All other hours: refresh due/upcoming statuses only.
  setInterval(() => {
    const hour = new Date().getUTCHours();
    const todayStr = todayISO();

    if (hour === 5 && lastRunDate !== todayStr) {
      lastRunDate = todayStr;
      console.log("[scheduler] ── Daily repayment job starting ──");
      updateDueStatuses()
        .then(() => updateHpDueStatuses())
        .then(() => processCharges())
        .then(() => processHpCharges())
        .then(() => console.log("[scheduler] ── Daily repayment job complete ──"))
        .catch((e) => {
          console.error("[scheduler] Daily job error:", e);
          lastRunDate = ""; // Allow retry on next hourly tick
        });
    } else {
      updateDueStatuses().catch((e) =>
        console.error("[scheduler] Hourly status update error:", e)
      );
      updateHpDueStatuses().catch((e) =>
        console.error("[scheduler] Hourly HP status update error:", e)
      );
    }
  }, 60 * 60 * 1000); // Every hour

  // Keep-warm ping: in production, ping our own healthz endpoint every 10 minutes
  // so the autoscale instance never idles to zero and the scheduler stays alive.
  if (process.env["NODE_ENV"] === "production") {
    const selfUrl = "https://doyang.biz/api/healthz";
    setInterval(() => {
      fetch(selfUrl, { signal: AbortSignal.timeout(10_000) })
        .then(() => console.log("[scheduler] keep-warm ping OK"))
        .catch((e: unknown) =>
          console.warn("[scheduler] keep-warm ping failed:", e instanceof Error ? e.message : e)
        );
    }, 10 * 60 * 1000); // every 10 minutes
    console.log(`[scheduler] Keep-warm pings enabled → ${selfUrl} every 10 min`);
  }

  console.log(
    `[scheduler] Started — status checks every hour, charges at 05:00 UTC (08:00 EAT) | ` +
      `retry schedule: ${RETRY_INTERVALS_DAYS.join("/")} days | max retries: ${MAX_RETRY_ATTEMPTS}`
  );
}
