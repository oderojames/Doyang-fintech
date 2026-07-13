import { getAdminFirestore } from "./firebase-admin.js";
import { chargeAuthorization, transferToMpesaWallet } from "./paystack.js";

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_INTERVALS_DAYS = [1, 3, 7];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoTimestamp: string, days: number): string {
  const d = new Date(isoTimestamp);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Update upcoming → due + recover stuck processing locks ────────────────────
export async function updateHpDueStatuses(): Promise<void> {
  const db = getAdminFirestore();
  const todayStr = todayISO();

  const ordersSnap = await db.collection("hp_orders").where("status", "==", "active").get();

  for (const orderDoc of ordersSnap.docs) {
    const batch = db.batch();
    let changed = false;

    const upcomingSnap = await orderDoc.ref
      .collection("repayments")
      .where("status", "==", "upcoming")
      .get();

    for (const doc of upcomingSnap.docs) {
      if ((doc.data().dueDate as string) <= todayStr) {
        batch.update(doc.ref, { status: "due" });
        changed = true;
      }
    }

    const processingSnap = await orderDoc.ref
      .collection("repayments")
      .where("status", "==", "processing")
      .get();

    for (const doc of processingSnap.docs) {
      const startedAt = doc.data().processingStartedAt as string | undefined;
      if (startedAt && Date.now() - new Date(startedAt).getTime() > 10 * 60 * 1000) {
        batch.update(doc.ref, { status: "due", processingStartedAt: null });
        changed = true;
        console.log(`[hp-scheduler] Recovered stuck processing lock on HP repayment ${doc.id}`);
      }
    }

    if (changed) await batch.commit();
  }
}

// ── Process a single HP installment ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processHpInstallment(orderRef: any, repayRef: any, order: any, repay: any): Promise<void> {
  const db = getAdminFirestore();

  // Acquire processing lock via Firestore transaction
  try {
    await db.runTransaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snap = (await tx.get(repayRef)) as any;
      if (!snap.exists) throw new Error("Document not found");
      const status = snap.data()?.["status"];
      if (status !== "due") throw new Error(`Not chargeable: status=${status}`);
      tx.update(repayRef, { status: "processing", processingStartedAt: new Date().toISOString() });
    });
  } catch (e) {
    console.log(
      `[hp-scheduler] Skip installment #${repay.installmentNumber as number} (order ${orderRef.id as string}): ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    return;
  }

  const authCode = order.buyerAuthCode as string | undefined;
  if (!authCode) {
    await repayRef.update({ status: "due", failureReason: "No buyer authorization code on file", processingStartedAt: null });
    console.error(`[hp-scheduler] HP order ${orderRef.id as string}: no buyerAuthCode — installment #${repay.installmentNumber as number} skipped`);
    return;
  }

  const splitCode = (order.splitCode as string | null | undefined) ?? null;

  console.log(
    `[hp-scheduler] Charging KES ${repay.amount as number} — HP installment #${repay.installmentNumber as number} of order ${orderRef.id as string}` +
    (splitCode ? ` | split: ${splitCode} (90% → seller)` : " | no split — subaccount pending") +
    (repay.retryCount ? ` | retry #${repay.retryCount as number}` : "")
  );

  const result = await chargeAuthorization(
    order.buyerEmail as string,
    repay.amount as number,
    authCode,
    {
      hpOrderId: orderRef.id as string,
      installmentNumber: repay.installmentNumber as number,
      buyerId: order.buyerId as string,
      sellerId: order.sellerId as string,
      dueDate: repay.dueDate as string,
    },
    splitCode
  );

  const now = new Date().toISOString();

  if (result.success) {
    const totalAmount = Number(repay.amount);
    const sellerShare = Math.round(totalAmount * 0.9 * 100) / 100;
    const platformShare = Math.round((totalAmount - sellerShare) * 100) / 100;
    let settlementStatus = splitCode ? "settled" : "pending_subaccount";
    let mpesaTransferRef: string | null = null;

    if (!splitCode) {
      const sellerSnap = await db.collection("users").doc(order.sellerId as string).get();
      const sellerData = sellerSnap.data();
      const wallet = sellerData?.verifiedMpesaWallet as string | undefined;
      if (wallet) {
        const payout = await transferToMpesaWallet(
          wallet,
          (sellerData?.displayName as string | undefined) || "Seller",
          sellerShare,
          `HP installment #${repay.installmentNumber as number} - ${String(order.productTitle ?? "item").slice(0, 25)}`
        );
        if (payout.success) {
          mpesaTransferRef = payout.reference ?? null;
          settlementStatus = "settled_mpesa";
          console.log(`[hp-scheduler] ✓ Mobile wallet payout sent to seller ${order.sellerId}: KES ${sellerShare} (ref: ${mpesaTransferRef})`);
        } else {
          console.warn(`[hp-scheduler] Mobile wallet payout FAILED for seller ${order.sellerId}: ${payout.error}`);
        }
      } else {
        console.warn(`[hp-scheduler] Seller ${order.sellerId} has no subaccount AND no verifiedMpesaWallet — payout cannot be sent`);
      }
    }

    await repayRef.update({
      status: "paid",
      paidAt: now,
      paystackReference: result.reference,
      processingStartedAt: null,
      failureReason: null,
      sellerShare,
      platformShare,
      settlementStatus,
      mpesaTransferRef,
    });

    console.log(
      `[hp-scheduler] ✓ HP installment #${repay.installmentNumber as number} PAID (ref: ${result.reference}) — ` +
      `seller: KES ${sellerShare}, platform: KES ${platformShare}, status: ${settlementStatus}`
    );

    // Check completion
    const allSnap = await orderRef.collection("repayments").get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paidCount = (allSnap.docs as any[]).filter((d: any) => d.data().status === "paid").length;
    const totalInstallments = Number(order.installments);

    if (paidCount >= totalInstallments) {
      await orderRef.update({ status: "completed", completedAt: now });
      console.log(`[hp-scheduler] ✓ HP order ${orderRef.id as string} COMPLETED — all ${totalInstallments} installments paid`);

      const completedBase = { hpOrderId: orderRef.id as string, createdAt: now, read: false };
      db.collection("users").doc(order.buyerId as string).collection("notifications")
        .doc(`hp-complete-${orderRef.id as string}`)
        .set({
          ...completedBase,
          id: `hp-complete-${orderRef.id as string}`,
          type: "hp_completed",
          title: "Hire purchase complete!",
          body: `All ${totalInstallments} installments for "${order.productTitle as string}" have been paid. The item is fully yours!`,
        }).catch(() => {});

      db.collection("users").doc(order.sellerId as string).collection("notifications")
        .doc(`hp-complete-${orderRef.id as string}`)
        .set({
          ...completedBase,
          id: `hp-complete-${orderRef.id as string}`,
          type: "hp_completed",
          title: "Hire purchase fully collected",
          body: `All ${totalInstallments} installments for "${order.productTitle as string}" have been collected successfully.`,
        }).catch(() => {});
    } else {
      const remaining = totalInstallments - paidCount;
      db.collection("users").doc(order.buyerId as string).collection("notifications")
        .doc(`hp-paid-${orderRef.id as string}-${repay.installmentNumber as number}`)
        .set({
          id: `hp-paid-${orderRef.id as string}-${repay.installmentNumber as number}`,
          type: "hp_installment_paid",
          title: "HP installment charged",
          body: `Installment #${repay.installmentNumber as number} of KES ${totalAmount.toLocaleString()} for "${order.productTitle as string}" was charged. ${remaining} installment${remaining !== 1 ? "s" : ""} remaining.`,
          hpOrderId: orderRef.id as string,
          createdAt: now,
          read: false,
        }).catch(() => {});
    }
  } else {
    // Apply retry schedule
    const newRetryCount = (Number(repay.retryCount) || 0) + 1;
    const failureReason = result.error ?? "Charge failed";

    if (newRetryCount > MAX_RETRY_ATTEMPTS) {
      await repayRef.update({
        status: "failed",
        failureReason,
        lastFailedAt: now,
        processingStartedAt: null,
        retryCount: newRetryCount,
      });
      console.log(`[hp-scheduler] ✗ HP installment #${repay.installmentNumber as number} EXHAUSTED retries — order ${orderRef.id as string} → checking default`);

      const allSnap = await orderRef.collection("repayments").get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasFailed = (allSnap.docs as any[]).some((d: any) => d.data().status === "failed");
      if (hasFailed) {
        await orderRef.update({ status: "defaulted", defaultedAt: now });
        console.log(`[hp-scheduler] ⚠ HP order ${orderRef.id as string} DEFAULTED`);

        db.collection("users").doc(order.buyerId as string).collection("notifications")
          .doc(`hp-default-${orderRef.id as string}`)
          .set({
            id: `hp-default-${orderRef.id as string}`,
            type: "hp_defaulted",
            title: "Hire purchase defaulted",
            body: `Your hire purchase for "${order.productTitle as string}" has defaulted after repeated failed payment attempts. Please contact support.`,
            hpOrderId: orderRef.id as string,
            createdAt: now,
            read: false,
          }).catch(() => {});

        db.collection("users").doc(order.sellerId as string).collection("notifications")
          .doc(`hp-default-${orderRef.id as string}`)
          .set({
            id: `hp-default-${orderRef.id as string}`,
            type: "hp_defaulted",
            title: "Hire purchase defaulted",
            body: `The hire purchase order for "${order.productTitle as string}" has defaulted after repeated failed payment attempts.`,
            hpOrderId: orderRef.id as string,
            createdAt: now,
            read: false,
          }).catch(() => {});
      }
    } else {
      const nextRetryAt = addDays(now, RETRY_INTERVALS_DAYS[newRetryCount - 1] ?? 7);
      await repayRef.update({
        status: "due",
        failureReason,
        lastFailedAt: now,
        processingStartedAt: null,
        retryCount: newRetryCount,
        nextRetryAt,
      });
      console.log(
        `[hp-scheduler] ✗ HP installment #${repay.installmentNumber as number} FAILED — ` +
        `retry ${newRetryCount}/${MAX_RETRY_ATTEMPTS} at ${nextRetryAt}: ${failureReason}`
      );
    }
  }
}

// ── Process all due HP charges ────────────────────────────────────────────────
export async function processHpCharges(): Promise<void> {
  const db = getAdminFirestore();
  const todayStr = todayISO();

  const ordersSnap = await db.collection("hp_orders").where("status", "==", "active").get();
  console.log(`[hp-scheduler] Processing charges for ${ordersSnap.docs.length} active HP order(s)`);

  for (const orderDoc of ordersSnap.docs) {
    const order = orderDoc.data();
    const dueSnap = await orderDoc.ref
      .collection("repayments")
      .where("status", "==", "due")
      .get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chargeable = dueSnap.docs.filter((doc: any) => {
      const nextRetryAt = doc.data().nextRetryAt as string | null | undefined;
      return !nextRetryAt || nextRetryAt <= todayStr;
    });

    const deferred = dueSnap.docs.length - chargeable.length;
    if (deferred > 0) {
      console.log(`[hp-scheduler] Order ${orderDoc.id}: ${chargeable.length} ready, ${deferred} deferred`);
    }

    for (const repayDoc of chargeable) {
      await processHpInstallment(orderDoc.ref, repayDoc.ref, order, repayDoc.data());
    }
  }
}
