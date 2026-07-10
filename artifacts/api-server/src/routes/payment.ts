import { Router, type Request, type Response } from "express";
import { getAdminAuth, getAdminFirestore } from "../lib/firebase-admin.js";

async function verifyToken(req: Request): Promise<{ uid: string } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const idToken = header.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

const router = Router();

const SECRET_KEY = () => process.env.PAYSTACK_SECRET_KEY ?? "";
const BASE = "https://api.paystack.co";

// Paystack M-Pesa (Kenya) REQUIRES the format: +254XXXXXXXXX (tested — all other formats fail).
// We normalise every common variant the user might type into that exact format.
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Local 0XXXXXXXXX (10 digits, 07XX or 01XX) → +254XXXXXXXXX
  if (digits.startsWith("0") && digits.length === 10) return "+254" + digits.slice(1);
  // Already international without +: 254XXXXXXXXX (12 digits) → +254XXXXXXXXX
  if (digits.startsWith("254") && digits.length === 12) return "+" + digits;
  // 9 raw digits (user skipped leading 0): 7XXXXXXXXX → +2547XXXXXXXXX
  if (digits.length === 9) return "+254" + digits;
  return raw.trim(); // pass through in case the user typed +254... already
}

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

// POST /payment/initiate — send M-Pesa STK push via Paystack Charge API
// Requires authentication to bind the STK push to a known buyer (prevents spam).
router.post("/payment/initiate", async (req: Request, res: Response) => {
  const authUser = await verifyToken(req);
  if (!authUser) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const { phone, amount, email, productId } = req.body as {
    phone?: string;
    amount?: number;
    email?: string;
    productId?: string;
  };

  if (!phone) {
    res.status(400).json({ success: false, error: "Phone number is required" });
    return;
  }

  // productId is optional here — this endpoint is shared between the marketplace
  // buy flow (always sends productId) and non-marketplace flows such as seller
  // verification (Vault.tsx) and wholesaler settlement (WholesalerPage.tsx).
  // For marketplace charges productId is embedded in Paystack metadata and
  // hard-validated in POST /api/orders, preventing cross-flow replay.

  const formatted = formatPhone(phone);
  if (!formatted.startsWith("+254") || formatted.length !== 13) {
    res.status(400).json({
      success: false,
      error: "Please provide a valid Kenyan number (e.g. 0712 345 678 or 01XX XXX XXX)",
    });
    return;
  }

  const chargeAmount = typeof amount === "number" && amount > 0 ? amount : 50;
  const chargeEmail = email || "payments@doyang.app";

  // For marketplace purchases, look up the seller's Paystack subaccount so the
  // charge is automatically split: 5% to the platform, ~90% to the seller.
  let sellerSubaccountCode: string | null = null;
  if (productId) {
    try {
      const db = getAdminFirestore();
      const productSnap = await db.collection("products").doc(productId).get();
      if (productSnap.exists) {
        const sellerId = productSnap.data()!.sellerId as string;
        const sellerSnap = await db.collection("users").doc(sellerId).get();
        const code = sellerSnap.data()?.paystackSubaccountCode;
        if (typeof code === "string" && code.startsWith("ACCT_")) {
          sellerSubaccountCode = code;
        }
      }
    } catch (e) {
      // Non-fatal — charge proceeds without split if lookup fails
      console.warn("[payment] Could not fetch seller subaccount:", e instanceof Error ? e.message : String(e));
    }
  }

  // Platform fee: 5% of the charge amount (in kobo), sent to the main account.
  // bearer_type "subaccount" means Paystack transaction fees are deducted from the
  // subaccount's share — leaving the seller with approximately 90% net.
  const platformFeeKobo = sellerSubaccountCode
    ? Math.round(chargeAmount * 0.05 * 100)
    : 0;

  try {
    const data = await ps<{
      status: boolean;
      message: string;
      data: { reference: string; status: string };
    }>("POST", "/charge", {
      amount: chargeAmount * 100, // Paystack amounts are in kobo (KES × 100)
      email: chargeEmail,
      currency: "KES",
      mobile_money: {
        phone: formatted,
        provider: "mpesa",
      },
      metadata: {
        buyerUid: authUser.uid,
        ...(productId ? { productId } : {}),
        ...(sellerSubaccountCode ? { sellerSubaccount: sellerSubaccountCode } : {}),
        cancel_action: "https://doyang.app",
      },
      // Split: only injected when seller has a verified subaccount
      ...(sellerSubaccountCode ? {
        subaccount: sellerSubaccountCode,
        transaction_charge: platformFeeKobo, // 5% flat fee to platform main account
        bearer_type: "subaccount",           // seller bears Paystack transaction fees
      } : {}),
    });

    if (!data.status) {
      console.error("[payment] Paystack charge failed:", JSON.stringify(data));
      res.status(502).json({ success: false, error: data.message || "Payment initiation failed. Please try again." });
      return;
    }

    console.log(
      `[payment] M-Pesa STK push sent via Paystack — ref=${data.data.reference} phone=${formatted} amount=KES ${chargeAmount}`
    );

    res.json({
      success: true,
      data: {
        reference: data.data.reference,
        status: data.data.status,
      },
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Payment initiation failed. Please try again.";
    console.error("[payment] initiate error:", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /payment/status/:reference — poll Paystack charge status
// Paystack statuses: pending | pay_offline | success | failed | abandoned
// We normalise "success" → "completed" to keep the frontend unchanged.
router.get("/payment/status/:reference", async (req: Request, res: Response) => {
  const { reference } = req.params;

  try {
    const data = await ps<{
      status: boolean;
      message: string;
      data: { reference: string; status: string; amount: number; currency: string };
    }>("GET", `/charge/${encodeURIComponent(reference)}`);

    if (!data.status) {
      res.status(502).json({ success: false, error: data.message || "Status check failed" });
      return;
    }

    const chargeStatus = data.data.status;

    res.json({
      success: true,
      data: {
        // Normalise for frontend: "success" → "completed", everything else as-is
        status: chargeStatus === "success" ? "completed" : chargeStatus,
        reference: data.data.reference,
        amount: data.data.amount / 100, // convert kobo back to KES
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Status check failed";
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
