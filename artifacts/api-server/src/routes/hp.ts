import { Router, type Request, type Response } from "express";
import { getAdminAuth, getAdminFirestore } from "../lib/firebase-admin.js";
import { createTransactionSplit } from "../lib/paystack.js";

const router = Router();
const SECRET_KEY = () => process.env.PAYSTACK_SECRET_KEY ?? "";
const BASE = "https://api.paystack.co";

async function verifyToken(req: Request): Promise<{ uid: string; email: string } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const idToken = header.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? "" };
  } catch {
    return null;
  }
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

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return "+254" + digits.slice(1);
  if (digits.startsWith("254") && digits.length === 12) return "+" + digits;
  if (digits.length === 9) return "+254" + digits;
  return raw.trim();
}

function addDays(isoTimestamp: string, days: number): string {
  const d = new Date(isoTimestamp);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// POST /api/hp/initiate-deposit — STK push for the hire-purchase deposit
router.post("/hp/initiate-deposit", async (req: Request, res: Response) => {
  const authUser = await verifyToken(req);
  if (!authUser) { res.status(401).json({ error: "Authentication required" }); return; }

  const { productId, phone, email } = req.body as { productId?: string; phone?: string; email?: string };
  if (!productId || !phone) {
    res.status(400).json({ error: "productId and phone are required" }); return;
  }

  const formatted = formatPhone(phone);
  if (!formatted.startsWith("+254") || formatted.length !== 13) {
    res.status(400).json({ error: "Please provide a valid Kenyan number (e.g. 0712 345 678)" }); return;
  }

  const db = getAdminFirestore();

  const [productSnap, buyerSnap] = await Promise.all([
    db.collection("products").doc(productId).get(),
    db.collection("users").doc(authUser.uid).get(),
  ]);

  if (!productSnap.exists) { res.status(404).json({ error: "Product not found" }); return; }
  const product = productSnap.data()!;
  if (!product.hpEnabled) { res.status(400).json({ error: "Hire purchase is not enabled for this product" }); return; }
  if (product.status !== "published" || (product.quantity as number) < 1) {
    res.status(410).json({ error: "Product is not available" }); return;
  }

  const buyerData = buyerSnap.data();
  const authCode = buyerData?.buyerPaystackAuth?.authorization_code as string | undefined;
  const reusable = buyerData?.buyerPaystackAuth?.reusable as boolean | undefined;
  if (!authCode || !reusable) {
    res.status(402).json({
      error: "You must add a payment card before buying on hire purchase. Your card will be used for monthly installments.",
    }); return;
  }

  const depositAmount = Number(product.hpDeposit);
  if (!Number.isFinite(depositAmount) || depositAmount < 10) {
    res.status(400).json({ error: "Invalid deposit amount on this product" }); return;
  }

  const chargeEmail = email || authUser.email || "payments@doyang.app";

  try {
    const data = await ps<{
      status: boolean; message: string;
      data: { reference: string; status: string };
    }>("POST", "/charge", {
      amount: Math.round(depositAmount * 100),
      email: chargeEmail,
      currency: "KES",
      mobile_money: { phone: formatted, provider: "mpesa" },
      metadata: {
        buyerUid: authUser.uid,
        productId,
        isHpDeposit: true,
        cancel_action: "https://doyang.app",
      },
    });

    if (!data.status) {
      res.status(502).json({ error: data.message || "Deposit initiation failed. Please try again." }); return;
    }

    console.log(`[hp] Deposit STK push — ref=${data.data.reference} phone=${formatted} amount=KES ${depositAmount}`);
    res.json({ success: true, data: { reference: data.data.reference, status: data.data.status, amount: depositAmount } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Deposit initiation failed" });
  }
});

// GET /api/hp/deposit-status/:reference — poll M-PESA charge status
router.get("/hp/deposit-status/:reference", async (req: Request, res: Response) => {
  const { reference } = req.params;
  try {
    const data = await ps<{
      status: boolean; message: string;
      data: { reference: string; status: string; amount: number };
    }>("GET", `/charge/${encodeURIComponent(reference)}`);

    if (!data.status) { res.status(502).json({ success: false, error: data.message }); return; }
    res.json({
      success: true,
      data: {
        status: data.data.status === "success" ? "completed" : data.data.status,
        reference: data.data.reference,
        amount: data.data.amount / 100,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Status check failed" });
  }
});

// POST /api/hp/confirm — verify deposit + create HP order + schedule installments
router.post("/hp/confirm", async (req: Request, res: Response) => {
  const authUser = await verifyToken(req);
  if (!authUser) { res.status(401).json({ error: "Authentication required" }); return; }

  const { productId, depositRef } = req.body as { productId?: string; depositRef?: string };
  if (!productId || !depositRef) {
    res.status(400).json({ error: "productId and depositRef are required" }); return;
  }

  const db = getAdminFirestore();

  // 1. Verify the M-Pesa deposit with Paystack
  const payData = await ps<{
    status: boolean;
    data?: {
      status: string; amount: number; reference: string;
      metadata?: { buyerUid?: string; productId?: string; isHpDeposit?: boolean };
    };
  }>("GET", `/charge/${encodeURIComponent(depositRef)}`);

  if (!payData.status || payData.data?.status !== "success") {
    res.status(402).json({ error: "Deposit not confirmed by Paystack. Please retry." }); return;
  }

  const meta = payData.data?.metadata;
  if (!meta?.isHpDeposit) {
    res.status(403).json({ error: "Payment reference is not a hire-purchase deposit" }); return;
  }
  if (meta.buyerUid !== authUser.uid) {
    res.status(403).json({ error: "Payment reference does not belong to you" }); return;
  }
  if (meta.productId !== productId) {
    res.status(400).json({ error: "Payment reference was not made for this product" }); return;
  }

  const paidDeposit = payData.data!.amount / 100;

  // 2. Load product + buyer concurrently
  const [productSnap, buyerSnap] = await Promise.all([
    db.collection("products").doc(productId).get(),
    db.collection("users").doc(authUser.uid).get(),
  ]);

  if (!productSnap.exists) { res.status(404).json({ error: "Product not found" }); return; }
  const product = productSnap.data()!;
  if (!product.hpEnabled) { res.status(400).json({ error: "Product does not support hire purchase" }); return; }

  const buyerData = buyerSnap.data();
  const authCode = buyerData?.buyerPaystackAuth?.authorization_code as string | undefined;
  const reusable = buyerData?.buyerPaystackAuth?.reusable as boolean | undefined;
  if (!authCode || !reusable) {
    res.status(402).json({ error: "No reusable card on file. Please add a payment card." }); return;
  }

  const sellerId = product.sellerId as string;
  const sellerSnap = await db.collection("users").doc(sellerId).get();
  const sellerData = sellerSnap.data();
  const sellerSubaccountCode = (sellerData?.paystackSubaccountCode as string | undefined) ?? null;
  const sellerEmail = (sellerData?.email as string | undefined) ?? "seller@doyang.app";

  // 3. Idempotency check
  const hpOrderId = `hp-${depositRef.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60)}`;
  const hpOrderRef = db.collection("hp_orders").doc(hpOrderId);
  const existingSnap = await hpOrderRef.get();
  if (existingSnap.exists) {
    res.json({ success: true, hpOrderId, duplicate: true }); return;
  }

  // 4. Create Paystack split code so seller gets 90% of each installment (non-fatal)
  let splitCode: string | null = null;
  if (sellerSubaccountCode) {
    const splitResult = await createTransactionSplit(hpOrderId, sellerSubaccountCode, 90);
    if (splitResult.success && splitResult.splitCode) {
      splitCode = splitResult.splitCode;
      console.log(`[hp] Split code ${splitCode} created for HP order ${hpOrderId}`);
    } else {
      console.warn(`[hp] Split creation failed (non-fatal) — order ${hpOrderId}: ${splitResult.error}`);
    }
  }

  const now = new Date().toISOString();
  const installments = Number(product.hpInstallments);
  const installmentAmount = Number(product.hpInstallmentAmount);
  const intervalDays = Number(product.hpIntervalDays) || 30;

  // 5. Atomic: decrement stock + create HP order
  try {
    await db.runTransaction(async (txn) => {
      const freshSnap = await txn.get(db.collection("products").doc(productId));
      if (!freshSnap.exists) throw new Error("PRODUCT_NOT_FOUND");
      const freshProduct = freshSnap.data()!;
      if (freshProduct.status !== "published" || (freshProduct.quantity as number) < 1) {
        throw new Error("PRODUCT_UNAVAILABLE");
      }
      const newQty = (freshProduct.quantity as number) - 1;
      txn.update(db.collection("products").doc(productId), {
        quantity: newQty,
        ...(newQty <= 0 ? { status: "sold_out" } : {}),
        updatedAt: now,
      });
      txn.set(hpOrderRef, {
        id: hpOrderId,
        buyerId: authUser.uid,
        buyerEmail: authUser.email || buyerData?.email || "",
        buyerAuthCode: authCode,
        sellerId,
        sellerEmail,
        productId,
        productTitle: product.title as string,
        depositAmount: paidDeposit,
        depositRef,
        installments,
        installmentAmount,
        intervalDays,
        splitCode,
        sellerSubaccountCode: sellerSubaccountCode ?? null,
        installmentsPaid: 0,
        status: "active",
        createdAt: now,
      });
    });
  } catch (txnErr) {
    const msg = txnErr instanceof Error ? txnErr.message : String(txnErr);
    if (msg === "PRODUCT_NOT_FOUND") { res.status(404).json({ error: "Product not found" }); return; }
    if (msg === "PRODUCT_UNAVAILABLE") { res.status(410).json({ error: "Product no longer available" }); return; }
    console.error("[hp] Transaction error:", msg);
    res.status(500).json({ error: "HP order creation failed. Please contact support." }); return;
  }

  // 6. Create installment schedule in subcollection (outside transaction — no conflict risk)
  const batch = db.batch();
  for (let i = 1; i <= installments; i++) {
    const dueDate = addDays(now, intervalDays * i);
    batch.set(hpOrderRef.collection("repayments").doc(String(i)), {
      installmentNumber: i,
      amount: installmentAmount,
      dueDate,
      status: "upcoming",
      retryCount: 0,
      nextRetryAt: null,
      paidAt: null,
      paystackReference: null,
      processingStartedAt: null,
    });
  }
  await batch.commit();

  // 7. Notify seller (non-fatal)
  db.collection("users").doc(sellerId).collection("notifications")
    .doc(`hp-order-${hpOrderId}`)
    .set({
      id: `hp-order-${hpOrderId}`,
      type: "hp_order",
      title: "New hire purchase order",
      body: `${buyerData?.displayName || authUser.email || "A buyer"} placed a hire purchase order for "${product.title as string}". Deposit: KES ${paidDeposit.toLocaleString()}. ${installments} installments of KES ${installmentAmount.toLocaleString()} to follow.`,
      hpOrderId,
      createdAt: now,
      read: false,
    }).catch(() => {});

  console.log(`[hp] Order created: ${hpOrderId} — buyer ${authUser.uid}, seller ${sellerId}, ${installments}×KES ${installmentAmount}, interval ${intervalDays} days`);
  res.json({ success: true, hpOrderId });
});

// GET /api/hp/orders — fetch HP orders for the authenticated user (buyer or seller) with repayments
router.get("/hp/orders", async (req: Request, res: Response) => {
  const authUser = await verifyToken(req);
  if (!authUser) { res.status(401).json({ error: "Authentication required" }); return; }

  const db = getAdminFirestore();
  const uid = authUser.uid;

  const [buyerSnap, sellerSnap] = await Promise.all([
    db.collection("hp_orders").where("buyerId", "==", uid).get(),
    db.collection("hp_orders").where("sellerId", "==", uid).get(),
  ]);

  const orderMap = new Map<string, Record<string, unknown>>();
  [...buyerSnap.docs, ...sellerSnap.docs].forEach(d => {
    if (!orderMap.has(d.id)) orderMap.set(d.id, d.data() as Record<string, unknown>);
  });

  const ordersWithRepayments = await Promise.all(
    Array.from(orderMap.entries()).map(async ([id, data]) => {
      const repSnap = await db
        .collection("hp_orders").doc(id)
        .collection("repayments")
        .orderBy("installmentNumber")
        .get();
      return { ...data, id, repayments: repSnap.docs.map(d => d.data()) };
    })
  );

  ordersWithRepayments.sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  );

  res.json({ success: true, orders: ordersWithRepayments });
});

// POST /api/hp/disconnect-card — remove buyer's saved card; blocked while any active HP order exists
router.post("/hp/disconnect-card", async (req: Request, res: Response) => {
  const authUser = await verifyToken(req);
  if (!authUser) { res.status(401).json({ error: "Authentication required" }); return; }

  const db = getAdminFirestore();

  const activeSnap = await db
    .collection("hp_orders")
    .where("buyerId", "==", authUser.uid)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (!activeSnap.empty) {
    res.status(409).json({
      error: "You cannot remove your card while you have an active hire purchase plan. Complete all plans first.",
      hasActiveHp: true,
    });
    return;
  }

  await db.collection("users").doc(authUser.uid).update({
    buyerCardConnected: false,
    buyerPaystackAuth: null,
  });

  console.log(`[hp] Card disconnected for buyer ${authUser.uid}`);
  res.json({ success: true });
});

export default router;
