import { Router, type Request } from "express";
import { getAdminFirestore, getAdminAuth } from "../lib/firebase-admin.js";
import { createTransactionSplit, createSubaccount } from "../lib/paystack.js";

const router = Router();

// Replit's outer proxy strips the Authorization header — use custom header instead.
async function verifyToken(req: Request): Promise<string | null> {
  const token = req.headers["x-firebase-token"] as string | undefined;
  if (!token) {
    console.error("[loan-offers] verifyToken: X-Firebase-Token header missing");
    return null;
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    console.error("[loan-offers] verifyToken: failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── POST /api/loan-offers — wholesaler creates an offer ──────────────────────
router.post("/loan-offers", async (req, res) => {
  try {
    const uid = await verifyToken(req);
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

    const roleSnap = await getAdminFirestore().collection("users").doc(uid).get(); if ((roleSnap.data()?.role ?? "retailer") !== "wholesaler") { res.status(403).json({ error: "Only wholesalers can create loan offers" }); return; }
    const body = req.body as Record<string, unknown>;
    if (body.wholesalerUid !== uid) {
      res.status(403).json({ error: "Forbidden: wholesalerUid must match authenticated user" }); return;
    }

    const db = getAdminFirestore();
    const offerRef = db.collection("loan_offers").doc();
    await offerRef.set({ ...body, id: offerRef.id, createdAt: new Date().toISOString() });

    const retailerUid = body.retailerUid as string;
    if (retailerUid) {
      db.collection("users").doc(retailerUid).collection("notifications").doc(offerRef.id).set({
        id: offerRef.id,
        type: "loan_offer",
        title: "New credit offer from your wholesaler",
        body: `${body.wholesalerName} has offered you KES ${Number(body.principal).toLocaleString()} — ${body.installments} ${String(body.repaymentFrequency)} installments. Tap to review and accept.`,
        offerId: offerRef.id,
        createdAt: new Date().toISOString(),
        read: false,
      }).catch(() => {});
    }

    res.json({ success: true, offerId: offerRef.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── GET /api/loan-offers — fetch offers for a retailer or wholesaler ─────────
router.get("/loan-offers", async (req, res) => {
  try {
    const uid = await verifyToken(req);
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { retailerUid, wholesalerUid } = req.query as Record<string, string>;
    const db = getAdminFirestore();
    let snap;

    if (retailerUid) {
      if (uid !== retailerUid) { res.status(403).json({ error: "Forbidden" }); return; }
      snap = await db.collection("loan_offers").where("retailerUid", "==", retailerUid).get();
    } else if (wholesalerUid) {
      if (uid !== wholesalerUid) { res.status(403).json({ error: "Forbidden" }); return; }
      snap = await db.collection("loan_offers").where("wholesalerUid", "==", wholesalerUid).get();
    } else {
      res.status(400).json({ error: "retailerUid or wholesalerUid query param required" }); return;
    }

    res.json({ success: true, offers: snap.docs.map(d => d.data()) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── PATCH /api/loan-offers/:offerId — retailer responds to an offer ──────────
router.patch("/loan-offers/:offerId", async (req, res) => {
  try {
    const uid = await verifyToken(req);
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

    const roleSnap = await getAdminFirestore().collection("users").doc(uid).get(); if ((roleSnap.data()?.role ?? "retailer") !== "retailer") { res.status(403).json({ error: "Only retailers can respond to loan offers" }); return; }
    const { offerId } = req.params;
    const body = req.body as { status: string; confirmations?: Record<string, boolean> };
    const { status, confirmations } = body;

    if (!["active", "declined"].includes(status)) {
      res.status(400).json({ error: "status must be 'active' or 'declined'" }); return;
    }

    const db = getAdminFirestore();
    const ref = db.collection("loan_offers").doc(offerId);
    const snap = await ref.get();
    if (!snap.exists) { res.status(404).json({ error: "Offer not found" }); return; }

    const data = snap.data()!;
    if (data.retailerUid !== uid) {
      res.status(403).json({ error: "Only the retailer can respond to this offer" }); return;
    }
    if (data.status === "active" || data.status === "declined") {
      res.status(409).json({ error: "Offer has already been responded to" }); return;
    }

    if (status === "active") {
      // Validate all three confirmations are present
      if (!confirmations?.loanAgreement || !confirmations?.recurringRepayments || !confirmations?.paystackAuthorization) {
        res.status(400).json({ error: "All three confirmations are required to activate the loan" }); return;
      }

      // Generate repayment installments from the stored schedule
      type ScheduleItem = {
        no: number; dueDate: string; interest: number;
        principal: number; payment: number; balance: number;
      };
      const schedule = (data.schedule ?? []) as ScheduleItem[];

      const batch = db.batch();

      // Update the offer document
      batch.update(ref, {
        status: "active",
        activatedAt: new Date().toISOString(),
        confirmations: {
          loanAgreement: true,
          recurringRepayments: true,
          paystackAuthorization: true,
          confirmedAt: new Date().toISOString(),
        },
      });

      // Write each installment as a subcollection document
      for (const s of schedule) {
        const repayRef = ref.collection("repayments").doc(String(s.no).padStart(4, "0"));
        const dueDate = s.dueDate.slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const isDue = dueDate <= today;

        batch.set(repayRef, {
          installmentNumber: s.no,
          dueDate,
          amount: s.payment,
          principal: s.principal,
          interest: s.interest,
          remainingBalance: s.balance,
          status: isDue ? "due" : "upcoming",
          paidAt: null,
          createdAt: new Date().toISOString(),
        });
      }

      await batch.commit();

      // Create Paystack split group for this specific loan.
      // The split MUST use the subaccount of the wholesaler who issued THIS offer.
      // We read wholesalerUid from the offer document itself (set and validated at offer-creation time).
      const offerWholesalerUid = data.wholesalerUid as string;
      const wholesalerSnap = await db.collection("users").doc(offerWholesalerUid).get();
      const wholesalerData = wholesalerSnap.data() ?? {};

      // ── Step 1: Ensure wholesaler has a Paystack subaccount ─────────────────
      // Settlement onboarding saves bank details to Firestore but doesn't call
      // Paystack (to avoid upfront validation errors). We create the subaccount
      // lazily here — once created, the code is saved so future loans use it
      // immediately without another API call.
      let wholesalerSubaccountCode = wholesalerData.paystackSubaccountCode as string | undefined;

      if (!wholesalerSubaccountCode) {
        const bankCode     = wholesalerData.settlementBankCode      as string | undefined;
        const accountNum   = wholesalerData.settlementAccountNumber as string | undefined;
        const businessName = (wholesalerData.displayName as string | undefined)
                          ?? (wholesalerData.email       as string | undefined)
                          ?? "Wholesaler";

        if (bankCode && accountNum) {
          console.log(
            `[loan-offers] Wholesaler ${offerWholesalerUid} has no subaccount yet — creating one now (bank: ${bankCode}, acct: ${accountNum.slice(-4).padStart(accountNum.length, "*")})`
          );
          const subResult = await createSubaccount(
            businessName,
            bankCode,
            accountNum,
            `Doyang wholesaler: ${businessName}`,
          );
          if (subResult.success && subResult.subaccountCode) {
            wholesalerSubaccountCode = subResult.subaccountCode;
            await db.collection("users").doc(offerWholesalerUid).update({
              paystackSubaccountCode: wholesalerSubaccountCode,
            });
            console.log(
              `[loan-offers] ✓ Subaccount ${wholesalerSubaccountCode} created and saved for wholesaler ${offerWholesalerUid}`
            );
          } else {
            console.warn(
              `[loan-offers] Could not create Paystack subaccount for wholesaler ${offerWholesalerUid}: ${subResult.error}`
            );
          }
        } else {
          console.log(
            `[loan-offers] Wholesaler ${offerWholesalerUid} has no bank details saved — split will remain pending`
          );
        }
      }

      // ── Step 2: Create the transaction split using the subaccount ────────────
      let splitCode: string | null = null;
      let splitStatus: "active" | "pending_subaccount" = "pending_subaccount";

      if (wholesalerSubaccountCode) {
        console.log(
          `[loan-offers] Creating split for offer ${offerId} — wholesaler: ${offerWholesalerUid}, subaccount: ${wholesalerSubaccountCode}`
        );
        const splitResult = await createTransactionSplit(offerId, wholesalerSubaccountCode, 90);
        if (splitResult.success && splitResult.splitCode) {
          splitCode = splitResult.splitCode;
          splitStatus = "active";
          console.log(
            `[loan-offers] ✓ Split ${splitCode} created — wholesaler ${offerWholesalerUid} will receive 90% of each repayment`
          );
        } else {
          console.warn(
            `[loan-offers] Split creation failed for offer ${offerId} (wholesaler ${offerWholesalerUid}): ${splitResult.error}`
          );
        }
      } else {
        console.warn(
          `[loan-offers] No subaccount available for wholesaler ${offerWholesalerUid} — split is pending. Verify bank details are saved.`
        );
      }

      await ref.update({
        splitCode,
        splitStatus,
        splitWholesalerUid: offerWholesalerUid,       // explicit record: whose subaccount this split uses
        wholesalerSubaccountCode: wholesalerSubaccountCode ?? null,
        splitSetupAt: new Date().toISOString(),
      });

      // Notify wholesaler
      db.collection("users").doc(data.wholesalerUid).collection("notifications")
        .doc(`offer-${offerId}-active`).set({
          id: `offer-${offerId}-active`,
          type: "loan_offer_response",
          title: "Credit offer accepted & loan activated",
          body: `${data.retailerName} accepted your credit offer of KES ${Number(data.principal).toLocaleString()} and activated the loan. ${schedule.length} repayment installments have been scheduled.`,
          offerId,
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(() => {});

    } else {
      // Declined
      await ref.update({ status: "declined", respondedAt: new Date().toISOString() });

      db.collection("users").doc(data.wholesalerUid).collection("notifications")
        .doc(`offer-${offerId}-declined`).set({
          id: `offer-${offerId}-declined`,
          type: "loan_offer_response",
          title: "Credit offer declined",
          body: `${data.retailerName} declined your credit offer of KES ${Number(data.principal).toLocaleString()}.`,
          offerId,
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(() => {});
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[loan-offers] PATCH error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── POST /api/loan-offers/:offerId/repair-split — retroactively create missing split ──
// Called when a loan is already active but splitCode is null (pending_subaccount).
// Safe to call multiple times — skips if split already exists.
router.post("/loan-offers/:offerId/repair-split", async (req, res) => {
  try {
    const uid = await verifyToken(req);
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { offerId } = req.params;
    const db = getAdminFirestore();
    const ref = db.collection("loan_offers").doc(offerId);
    const snap = await ref.get();

    if (!snap.exists) { res.status(404).json({ error: "Offer not found" }); return; }

    const offer = snap.data()!;
    if (offer.retailerUid !== uid && offer.wholesalerUid !== uid) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    if (offer.status !== "active") {
      res.status(400).json({ error: "Loan is not active" }); return;
    }

    // Already has a split — nothing to do
    if (offer.splitCode) {
      res.json({ success: true, splitCode: offer.splitCode, alreadyExisted: true });
      return;
    }

    const offerWholesalerUid = offer.wholesalerUid as string;
    const wholesalerSnap = await db.collection("users").doc(offerWholesalerUid).get();
    const wholesalerData = wholesalerSnap.data() ?? {};

    let wholesalerSubaccountCode = wholesalerData.paystackSubaccountCode as string | undefined;

    if (!wholesalerSubaccountCode) {
      const bankCode    = wholesalerData.settlementBankCode      as string | undefined;
      const accountNum  = wholesalerData.settlementAccountNumber as string | undefined;
      const businessName = (wholesalerData.displayName as string | undefined)
                        ?? (wholesalerData.email       as string | undefined)
                        ?? "Wholesaler";

      if (!bankCode || !accountNum) {
        res.status(422).json({
          error: "Wholesaler has not completed settlement setup. Ask them to add their bank details.",
          missingBankDetails: true,
        });
        return;
      }

      console.log(`[repair-split] Creating Paystack subaccount for wholesaler ${offerWholesalerUid} (bank: ${bankCode})`);
      const subResult = await createSubaccount(
        businessName, bankCode, accountNum,
        `Doyang wholesaler: ${businessName}`,
      );

      if (!subResult.success || !subResult.subaccountCode) {
        console.warn(`[repair-split] Subaccount creation failed for ${offerWholesalerUid}: ${subResult.error}`);
        res.status(502).json({
          error: `Could not create Paystack subaccount: ${subResult.error}`,
          paystackError: subResult.error,
        });
        return;
      }

      wholesalerSubaccountCode = subResult.subaccountCode;
      await db.collection("users").doc(offerWholesalerUid).update({
        paystackSubaccountCode: wholesalerSubaccountCode,
      });
      console.log(`[repair-split] ✓ Subaccount ${wholesalerSubaccountCode} created for wholesaler ${offerWholesalerUid}`);
    }

    console.log(`[repair-split] Creating split for offer ${offerId} — subaccount: ${wholesalerSubaccountCode}`);
    const splitResult = await createTransactionSplit(offerId, wholesalerSubaccountCode, 90);

    if (!splitResult.success || !splitResult.splitCode) {
      console.warn(`[repair-split] Split creation failed for offer ${offerId}: ${splitResult.error}`);
      res.status(502).json({
        error: `Could not create Paystack split: ${splitResult.error}`,
        paystackError: splitResult.error,
      });
      return;
    }

    await ref.update({
      splitCode: splitResult.splitCode,
      splitStatus: "active",
      splitWholesalerUid: offerWholesalerUid,
      wholesalerSubaccountCode,
      splitSetupAt: new Date().toISOString(),
      splitRepairedAt: new Date().toISOString(),
    });

    console.log(`[repair-split] ✓ Split ${splitResult.splitCode} created for offer ${offerId}`);
    res.json({ success: true, splitCode: splitResult.splitCode });
  } catch (err) {
    console.error("[repair-split] error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ── GET /api/loan-offers/:offerId/repayments — installment progress ──────────
router.get("/loan-offers/:offerId/repayments", async (req, res) => {
  try {
    const uid = await verifyToken(req);
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { offerId } = req.params;
    const db = getAdminFirestore();

    const offerSnap = await db.collection("loan_offers").doc(offerId).get();
    if (!offerSnap.exists) { res.status(404).json({ error: "Offer not found" }); return; }

    const offer = offerSnap.data()!;
    if (offer.retailerUid !== uid && offer.wholesalerUid !== uid) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const snap = await db.collection("loan_offers").doc(offerId).collection("repayments").get();
    const repayments = snap.docs
      .map(d => d.data())
      .sort((a, b) => (a.installmentNumber as number) - (b.installmentNumber as number));

    res.json({ success: true, repayments });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

export default router;

