import { Router, type Request } from "express";
import { getAdminFirestore, getAdminAuth } from "../lib/firebase-admin.js";

const router = Router();

const SECRET_KEY = () => process.env.PAYSTACK_SECRET_KEY ?? "";
const BASE = "https://api.paystack.co";

async function ps<T = unknown>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET_KEY()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<T>;
}

router.post("/paystack/create-customer", async (req, res) => {
  try {
    const { name, email, phone } = req.body as { name: string; email: string; phone?: string };
    if (!name || !email) {
      res.status(400).json({ error: "name and email are required" });
      return;
    }
    const payload: Record<string, string> = { first_name: name, email };
    if (phone) payload.phone = phone;

    const data = await ps<{ status: boolean; data: { customer_code: string; id: number; email: string } }>(
      "POST", "/customer", payload
    );
    if (!data.status) {
      res.status(502).json({ error: "Paystack customer creation failed" });
      return;
    }
    res.json({ customer_code: data.data.customer_code, id: data.data.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/paystack/initialize", async (req, res) => {
  try {
    const { email, reference, metadata } = req.body as {
      email: string;
      reference: string;
      metadata?: Record<string, unknown>;
    };
    if (!email || !reference) {
      res.status(400).json({ error: "email and reference are required" });
      return;
    }
    const data = await ps<{
      status: boolean;
      data: { authorization_url: string; access_code: string; reference: string };
    }>("POST", "/transaction/initialize", {
      email,
      amount: 2000,
      currency: "KES",
      reference,
      channels: ["card"],
      metadata: metadata ?? {},
    });
    if (!data.status) {
      res.status(502).json({ error: "Paystack initialization failed" });
      return;
    }
    res.json({
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/paystack/verify", async (req, res) => {
  try {
    const { reference } = req.body as { reference: string };
    if (!reference) {
      res.status(400).json({ error: "reference is required" });
      return;
    }
    const data = await ps<{
      status: boolean;
      data: {
        status: string;
        reference: string;
        authorization: {
          authorization_code: string;
          card_type: string;
          last4: string;
          exp_month: string;
          exp_year: string;
          bin: string;
          bank: string;
          channel: string;
          signature: string;
          reusable: boolean;
          country_code: string;
        };
      };
    }>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);

    if (!data.status || data.data.status !== "success") {
      res.status(402).json({ error: "Transaction not successful" });
      return;
    }
    const auth = data.data.authorization;
    if (!auth.reusable) {
      res.status(422).json({ error: "Card is not reusable" });
      return;
    }
    res.json({ authorization: auth });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/paystack/banks", async (_req, res) => {
  try {
    const data = await ps<{
      status: boolean;
      data: Array<{
        id: number; name: string; code: string; active: boolean;
        is_deleted: boolean; country: string; currency: string;
      }>;
    }>("GET", "/bank?country=kenya&perPage=100&use_cursor=false");
    if (!data.status) {
      res.status(502).json({ error: "Failed to fetch bank list" });
      return;
    }
    res.json({ banks: data.data.filter((b) => b.active && !b.is_deleted) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/paystack/resolve-account", async (req, res) => {
  try {
    const { account_number, bank_code } = req.body as { account_number: string; bank_code: string };
    if (!account_number || !bank_code) {
      res.status(400).json({ error: "account_number and bank_code are required" });
      return;
    }
    const data = await ps<{
      status: boolean;
      message: string;
      data: { account_number: string; account_name: string; bank_id: number };
    }>("GET", `/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`);
    if (!data.status) {
      res.status(422).json({ error: data.message || "Could not resolve account. Check the number and bank." });
      return;
    }
    res.json({ account_name: data.data.account_name, account_number: data.data.account_number });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/paystack/create-subaccount", async (req, res) => {
  try {
    const { business_name, settlement_bank, account_number, description } = req.body as {
      business_name: string;
      settlement_bank: string;
      account_number: string;
      description?: string;
    };
    if (!business_name || !settlement_bank || !account_number) {
      res.status(400).json({ error: "business_name, settlement_bank, and account_number are required" });
      return;
    }
    const data = await ps<{
      status: boolean;
      message: string;
      data: { id: number; subaccount_code: string; business_name: string; percentage_charge: number };
    }>("POST", "/subaccount", {
      business_name,
      settlement_bank,
      account_number,
      percentage_charge: 100,
      description: description ?? business_name,
    });
    if (!data.status) {
      res.status(502).json({ error: data.message || "Subaccount creation failed" });
      return;
    }
    res.json({ subaccount_code: data.data.subaccount_code, id: data.data.id });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /paystack/verify-and-refund — tokenise a card with zero net charge.
// Verifies the transaction, extracts the reusable authorization_code, then
// immediately issues a full refund so the buyer is never billed.
router.post("/paystack/verify-and-refund", async (req, res) => {
  try {
    const { reference } = req.body as { reference: string };
    if (!reference) {
      res.status(400).json({ error: "reference is required" });
      return;
    }

    const verifyData = await ps<{
      status: boolean;
      data: {
        status: string;
        reference: string;
        authorization: {
          authorization_code: string;
          card_type: string;
          last4: string;
          exp_month: string;
          exp_year: string;
          bin: string;
          bank: string;
          channel: string;
          signature: string;
          reusable: boolean;
          country_code: string;
        };
      };
    }>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);

    if (!verifyData.status || verifyData.data.status !== "success") {
      res.status(402).json({ error: "Transaction not successful" });
      return;
    }
    const auth = verifyData.data.authorization;
    if (!auth.reusable) {
      res.status(422).json({ error: "Card is not reusable" });
      return;
    }

    // Refund immediately — non-fatal: card is still tokenised even if refund call fails.
    try {
      await ps("POST", "/refund", { transaction: reference });
      console.log(`[paystack] Auto-refunded buyer card verification charge — ref=${reference}`);
    } catch (refundErr) {
      console.warn("[paystack] Auto-refund failed (non-fatal) — ref:", reference, refundErr instanceof Error ? refundErr.message : String(refundErr));
    }

    res.json({ authorization: auth });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/paystack/auth-check", async (req, res) => {
  try {
    const uid = req.query.uid as string;
    if (!uid) {
      res.status(400).json({ error: "uid is required" });
      return;
    }
    const db = getAdminFirestore();
    const snap = await db.collection("users").doc(uid).get();
    const data = snap.data();
    const hasAuthorization =
      data?.cardConnected === true &&
      typeof data?.paystackAuth?.authorization_code === "string" &&
      data.paystackAuth.authorization_code.length > 0;
    res.json({ hasAuthorization });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;

async function verifyToken(req: Request): Promise<{ uid: string } | null> {
  const token = req.headers["x-firebase-token"] as string | undefined;
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

// KES amount -> retailer slots granted. Must match PAYMENT_TIERS in WholesalerPage.tsx.
const QUOTA_TIERS: Record<number, number> = { 100: 10, 200: 20, 300: 30, 500: 50 };

// POST /api/wholesaler/upgrade-quota — server-verified quota purchase.
// Verifies the Paystack transaction directly (amount + status) before granting slots,
// and records the reference as redeemed to prevent replay. Only the Admin SDK can write
// slotQuota — Firestore rules block clients from writing it directly.
router.post("/wholesaler/upgrade-quota", async (req, res) => {
  try {
    const auth = await verifyToken(req);
    if (!auth) { res.status(401).json({ error: "Unauthorized" }); return; }

    const db = getAdminFirestore();
    const userRef = db.collection("users").doc(auth.uid);
    const userSnap = await userRef.get();
    const role = (userSnap.data()?.role as string) ?? "retailer";
    if (role !== "wholesaler") {
      res.status(403).json({ error: "Only wholesalers can purchase retailer slots" });
      return;
    }

    const { reference } = req.body as { reference?: string };
    if (!reference) { res.status(400).json({ error: "reference is required" }); return; }

    const usedRef = db.collection("quota_purchases").doc(reference);
    const usedSnap = await usedRef.get();
    if (usedSnap.exists) {
      res.status(409).json({ error: "This payment has already been redeemed" });
      return;
    }

    const data = await ps<{
      status: boolean;
      data: { status: string; amount: number; currency: string };
    }>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);

    if (!data.status || data.data.status !== "success") {
      res.status(402).json({ error: "Transaction not successful" });
      return;
    }

    const amountKes = data.data.amount / 100;
    const slots = QUOTA_TIERS[amountKes];
    if (!slots) {
      res.status(422).json({ error: `Unrecognised payment amount: KES ${amountKes}` });
      return;
    }

    const currentQuota = (userSnap.data()?.slotQuota as number) ?? 3;
    const newQuota = currentQuota + slots;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await userRef.update({
      slotQuota: newQuota,
      slotPurchasedAt: new Date(),
      slotExpiresAt: expiresAt,
    });

    await usedRef.set({
      wholesalerUid: auth.uid,
      amountKes,
      slots,
      redeemedAt: new Date(),
    });

    res.json({ success: true, newQuota, expiresAt: expiresAt.toISOString() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
