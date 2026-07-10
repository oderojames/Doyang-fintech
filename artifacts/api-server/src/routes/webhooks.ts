import { Router, type Request, type Response } from "express";
import { createHmac } from "crypto";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import { applyRetryLogic } from "../lib/scheduler.js";

const router = Router();

// ── Signature verification ────────────────────────────────────────────────────
function verifyPaystackSignature(rawBody: Buffer, signature: string): boolean {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  return expected === signature;
}

// ── Paystack event shape (only fields we care about) ──────────────────────────
interface ChargeData {
  id: number;
  reference: string;
  amount: number; // kobo
  status: string;
  gateway_response?: string;
  message?: string;
  metadata?: {
    offerId?: string;
    installmentNumber?: number;
    retailerUid?: string;
    wholesalerUid?: string;
    dueDate?: string;
  };
  authorization?: {
    authorization_code: string;
    reusable: boolean;
    last4: string;
    card_type: string;
    bank: string;
  };
  customer?: { email: string };
}

interface PaystackWebhookEvent {
  event: string;
  data: ChargeData;
}

// ── Idempotency helpers ───────────────────────────────────────────────────────
// Returns true if the event was already processed (caller should skip).
// If not already processed, writes the idempotency record within the
// provided transaction so the check + write is atomic.
type Tx = FirebaseFirestore.Transaction;
type Firestore = FirebaseFirestore.Firestore;

async function isAlreadyProcessed(
  db: Firestore,
  tx: Tx,
  paystackEventId: number,
): Promise<boolean> {
  const ref = db
    .collection("webhook_events")
    .doc(`paystack-${paystackEventId}`);
  const snap = await tx.get(ref);
  return snap.exists;
}

function markProcessed(
  db: Firestore,
  tx: Tx,
  paystackEventId: number,
  extra: Record<string, unknown>,
): void {
  const ref = db
    .collection("webhook_events")
    .doc(`paystack-${paystackEventId}`);
  tx.set(ref, {
    processedAt: new Date().toISOString(),
    ...extra,
  });
}

// ── Notification helper ───────────────────────────────────────────────────────
function sendNotification(
  db: Firestore,
  uid: string,
  docId: string,
  payload: Record<string, unknown>,
): void {
  db.collection("users")
    .doc(uid)
    .collection("notifications")
    .doc(docId)
    .set(payload)
    .catch(() => {});
}

// ── charge.success ─────────────────────────────────────────────────────────────
async function handleChargeSuccess(event: PaystackWebhookEvent): Promise<void> {
  const db = getAdminFirestore();
  const charge = event.data;
  const meta = charge.metadata ?? {};

  const offerId = meta.offerId;
  const installmentNumber = meta.installmentNumber;
  const retailerUid = meta.retailerUid;
  const wholesalerUid = meta.wholesalerUid;
  const reference = charge.reference;
  const amountKes = charge.amount / 100;

  // If none of our metadata fields are present this isn't a loan charge — ignore.
  if (!offerId || installmentNumber == null || !retailerUid || !wholesalerUid) {
    console.log(
      `[webhook] charge.success ref=${reference} — no loan metadata, ignoring`,
    );
    return;
  }

  // Find the repayment document
  const repaySnap = await db
    .collection("loan_offers")
    .doc(offerId)
    .collection("repayments")
    .where("installmentNumber", "==", installmentNumber)
    .limit(1)
    .get();

  if (repaySnap.empty) {
    console.warn(
      `[webhook] charge.success ref=${reference} — repayment not found: offer=${offerId} #${installmentNumber}`,
    );
    return;
  }

  const repayRef = repaySnap.docs[0].ref;
  const offerRef = db.collection("loan_offers").doc(offerId);
  const now = new Date().toISOString();

  // ── Atomic idempotency check + update ──────────────────────────────────────
  let alreadyPaidByScheduler = false;
  let splitCode: string | null = null;
  let wholesalerShare = 0;
  let platformShare = 0;
  let settlementStatus: "settled" | "pending_subaccount" = "pending_subaccount";

  try {
    await db.runTransaction(async (tx) => {
      // 1. Idempotency check
      if (await isAlreadyProcessed(db, tx, charge.id)) {
        throw new Error("DUPLICATE");
      }

      // 2. Read current repayment + offer
      const [repayDoc, offerDoc] = await Promise.all([
        tx.get(repayRef),
        tx.get(offerRef),
      ]);

      if (!repayDoc.exists) throw new Error("Repayment document missing");

      const repayData = repayDoc.data()!;
      const offerData = offerDoc.data() ?? {};
      splitCode = (offerData["splitCode"] as string | null | undefined) ?? null;

      wholesalerShare = Math.round(amountKes * 0.9 * 100) / 100;
      platformShare = Math.round((amountKes - wholesalerShare) * 100) / 100;
      settlementStatus = splitCode ? "settled" : "pending_subaccount";

      if (repayData["status"] === "paid") {
        // Scheduler already marked this paid — just add webhook confirmation.
        alreadyPaidByScheduler = true;
        tx.update(repayRef, { confirmedViaWebhook: true, webhookRef: reference });
        markProcessed(db, tx, charge.id, {
          event: "charge.success",
          reference,
          offerId,
          installmentNumber,
          note: "already_paid_by_scheduler",
        });
        return;
      }

      // 3. Mark as paid (catches any case the scheduler missed)
      tx.update(repayRef, {
        status: "paid",
        paidAt: now,
        paystackReference: reference,
        splitCode: splitCode ?? null,
        wholesalerShare,
        platformShare,
        settlementStatus,
        settlementAt: splitCode ? now : null,
        confirmedViaWebhook: true,
      });

      // 4. Write idempotency record
      markProcessed(db, tx, charge.id, {
        event: "charge.success",
        reference,
        offerId,
        installmentNumber,
        retailerUid,
        wholesalerUid,
        amountKes,
        wholesalerShare,
        platformShare,
        settlementStatus,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "DUPLICATE") {
      console.log(
        `[webhook] charge.success ref=${reference} — duplicate event, skipping`,
      );
      return;
    }
    throw e;
  }

  if (alreadyPaidByScheduler) {
    console.log(
      `[webhook] charge.success ref=${reference} — already paid by scheduler; added confirmedViaWebhook=true`,
    );
    return;
  }

  console.log(
    `[webhook] ✓ charge.success ref=${reference} offer=${offerId} #${installmentNumber} ` +
      `KES ${amountKes} | wholesaler: KES ${wholesalerShare} | platform: KES ${platformShare} | settlement: ${settlementStatus}`,
  );

  // ── Notifications (outside transaction) ──────────────────────────────────
  const retailerNotifId = `webhook-paid-${offerId}-${installmentNumber}`;
  sendNotification(db, retailerUid, retailerNotifId, {
    id: retailerNotifId,
    type: "repayment_paid",
    title: "Repayment confirmed",
    body: `Your installment #${installmentNumber} of KES ${amountKes.toLocaleString()} has been confirmed as paid.`,
    offerId,
    installmentNumber,
    paystackReference: reference,
    createdAt: now,
    read: false,
  });

  const wholesalerNotifId = `webhook-paid-${offerId}-${installmentNumber}`;
  sendNotification(db, wholesalerUid, wholesalerNotifId, {
    id: wholesalerNotifId,
    type: "repayment_received",
    title: "Repayment received",
    body:
      `Installment #${installmentNumber} of KES ${amountKes.toLocaleString()} received. ` +
      `Your share: KES ${wholesalerShare.toLocaleString()}` +
      (splitCode
        ? " — settled to your subaccount."
        : " — pending (subaccount not configured)."),
    offerId,
    installmentNumber,
    wholesalerShare,
    platformShare,
    settlementStatus,
    paystackReference: reference,
    createdAt: now,
    read: false,
  });

  // ── Check if loan is now fully repaid ─────────────────────────────────────
  const allSnap = await offerRef.collection("repayments").get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPaid = allSnap.docs.every((d: any) => d.data().status === "paid");

  if (allPaid && allSnap.docs.length > 0) {
    const totalWholesalerEarnings = (allSnap.docs as any[]).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, d: any) => sum + (Number(d.data().wholesalerShare) || 0),
      0,
    );
    const offerSnap = await offerRef.get();
    const offerData = offerSnap.data() ?? {};

    await offerRef.update({ status: "completed", completedAt: now });
    console.log(`[webhook] ★ Offer ${offerId} FULLY REPAID — marking completed`);

    const completedBase = { offerId, createdAt: now, read: false };

    sendNotification(db, wholesalerUid, `completed-${offerId}`, {
      ...completedBase,
      id: `completed-${offerId}`,
      type: "loan_completed",
      title: "Loan fully repaid",
      body: `${offerData["retailerName"] ?? "Retailer"}'s loan of KES ${Number(offerData["principal"]).toLocaleString()} has been fully repaid. Total earnings: KES ${totalWholesalerEarnings.toLocaleString()}.`,
    });

    sendNotification(db, retailerUid, `completed-${offerId}`, {
      ...completedBase,
      id: `completed-${offerId}`,
      type: "loan_completed",
      title: "Loan fully repaid — Congratulations!",
      body: `You have fully repaid your loan of KES ${Number(offerData["principal"]).toLocaleString()}.`,
    });
  }
}

// ── charge.failed ──────────────────────────────────────────────────────────────
// Role: safety-net for scheduler crashes. Normal flow: scheduler handles the
// failure, moves status from "processing" → "due"/"failed", and the webhook
// simply confirms. If the scheduler crashed before updating Firestore (status
// is still "processing"), the webhook applies the same retry logic itself.
async function handleChargeFailed(event: PaystackWebhookEvent): Promise<void> {
  const db = getAdminFirestore();
  const charge = event.data;
  const meta = charge.metadata ?? {};

  const offerId = meta.offerId;
  const installmentNumber = meta.installmentNumber;
  const retailerUid = meta.retailerUid;
  const wholesalerUid = meta.wholesalerUid;
  const reference = charge.reference;
  const failureReason =
    charge.gateway_response ?? charge.message ?? "Payment declined";

  if (!offerId || installmentNumber == null || !retailerUid) {
    console.log(
      `[webhook] charge.failed ref=${reference} — no loan metadata, ignoring`,
    );
    return;
  }

  const repaySnap = await db
    .collection("loan_offers")
    .doc(offerId)
    .collection("repayments")
    .where("installmentNumber", "==", installmentNumber)
    .limit(1)
    .get();

  if (repaySnap.empty) {
    console.warn(
      `[webhook] charge.failed ref=${reference} — repayment not found: offer=${offerId} #${installmentNumber}`,
    );
    return;
  }

  const repayRef = repaySnap.docs[0].ref;
  const offerRef = db.collection("loan_offers").doc(offerId);
  const now = new Date().toISOString();

  // ── Atomic idempotency check + status snapshot ──────────────────────────────
  let currentStatus = "";
  let currentRepayData: Record<string, unknown> = {};
  let schedulerAlreadyHandled = false;

  try {
    await db.runTransaction(async (tx) => {
      if (await isAlreadyProcessed(db, tx, charge.id)) {
        throw new Error("DUPLICATE");
      }

      const repayDoc = await tx.get(repayRef);
      if (!repayDoc.exists) throw new Error("Repayment document missing");

      currentRepayData = repayDoc.data()!;
      currentStatus = currentRepayData["status"] as string;

      if (currentStatus === "paid") {
        // Contradictory: failed event but already paid — trust paid state.
        console.warn(
          `[webhook] charge.failed ref=${reference} — repayment already paid; ignoring failure`,
        );
        markProcessed(db, tx, charge.id, {
          event: "charge.failed",
          reference,
          offerId,
          installmentNumber,
          note: "contradicts_paid_status",
        });
        throw new Error("IGNORE");
      }

      if (currentStatus === "due" || currentStatus === "failed") {
        // Scheduler already updated this repayment — just stamp webhook confirmation.
        schedulerAlreadyHandled = true;
        tx.update(repayRef, { confirmedViaWebhook: true, webhookRef: reference });
        markProcessed(db, tx, charge.id, {
          event: "charge.failed",
          reference,
          offerId,
          installmentNumber,
          note: "already_handled_by_scheduler",
        });
        return;
      }

      // Status is "processing" → scheduler crashed after charging but before
      // updating Firestore. Release the lock so applyRetryLogic can update it.
      tx.update(repayRef, {
        status: "due",
        processingStartedAt: null,
        paystackReference: reference,
        confirmedViaWebhook: true,
      });

      markProcessed(db, tx, charge.id, {
        event: "charge.failed",
        reference,
        offerId,
        installmentNumber,
        retailerUid,
        wholesalerUid: wholesalerUid ?? null,
        failureReason,
        note: "webhook_safety_net",
      });
    });
  } catch (e) {
    if (e instanceof Error && (e.message === "DUPLICATE" || e.message === "IGNORE")) {
      console.log(`[webhook] charge.failed ref=${reference} — ${e.message.toLowerCase()}, skipping`);
      return;
    }
    throw e;
  }

  if (schedulerAlreadyHandled) {
    console.log(
      `[webhook] charge.failed ref=${reference} offer=${offerId} #${installmentNumber} ` +
        `— scheduler already handled (status: ${currentStatus}); added confirmedViaWebhook=true`,
    );
    return;
  }

  // ── Safety-net path: apply retry logic (scheduler crashed) ─────────────────
  console.log(
    `[webhook] ✗ charge.failed ref=${reference} offer=${offerId} #${installmentNumber}: ` +
      `${failureReason} — scheduler crash recovery, applying retry logic`,
  );

  const offerSnap = await offerRef.get();
  const offer = offerSnap.data() ?? {};

  await applyRetryLogic(
    offerRef,
    repayRef,
    { ...offer, retailerUid, wholesalerUid },
    { ...currentRepayData, status: "due" },
    failureReason,
    now,
  );

  // Notify retailer (applyRetryLogic already sends notifications, but we also
  // send a webhook-specific one so the message references the Paystack ref).
  const retailerNotifId = `webhook-failed-${offerId}-${installmentNumber}`;
  sendNotification(db, retailerUid, retailerNotifId, {
    id: retailerNotifId,
    type: "repayment_failed",
    title: "Repayment failed — retry scheduled",
    body: `Installment #${installmentNumber} could not be charged. Reason: ${failureReason}. A retry will be attempted automatically.`,
    offerId,
    installmentNumber,
    paystackReference: reference,
    createdAt: now,
    read: false,
  });

  // Notify wholesaler
  if (wholesalerUid) {
    const wholesalerNotifId = `webhook-failed-${offerId}-${installmentNumber}`;
    sendNotification(db, wholesalerUid, wholesalerNotifId, {
      id: wholesalerNotifId,
      type: "repayment_failed",
      title: "Repayment failed",
      body: `A repayment from ${meta.offerId ?? "a retailer"} (installment #${installmentNumber}) failed: ${failureReason}.`,
      offerId,
      installmentNumber,
      paystackReference: reference,
      createdAt: now,
      read: false,
    });
  }
}

// ── Route: POST /webhooks/paystack ────────────────────────────────────────────
router.post(
  "/paystack",
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers["x-paystack-signature"] as string | undefined;

    // req.body is a Buffer (because the route is mounted with express.raw())
    if (!Buffer.isBuffer(req.body) || !signature) {
      res.status(400).json({ error: "Missing body or signature" });
      return;
    }

    if (!verifyPaystackSignature(req.body, signature)) {
      console.warn("[webhook] Rejected — invalid Paystack signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    let event: PaystackWebhookEvent;
    try {
      event = JSON.parse(req.body.toString("utf8")) as PaystackWebhookEvent;
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    // Acknowledge immediately — Paystack retries on non-200 or timeout
    res.status(200).json({ received: true });

    // Process asynchronously after responding
    const eventType = event.event;
    console.log(
      `[webhook] Received event: ${eventType} | ref=${event.data?.reference ?? "—"} | id=${event.data?.id ?? "—"}`,
    );

    if (eventType === "charge.success") {
      handleChargeSuccess(event).catch((e) =>
        console.error("[webhook] charge.success handler error:", e),
      );
    } else if (eventType === "charge.failed") {
      handleChargeFailed(event).catch((e) =>
        console.error("[webhook] charge.failed handler error:", e),
      );
    } else {
      console.log(`[webhook] Unhandled event type: ${eventType}`);
    }
  },
);

export default router;
