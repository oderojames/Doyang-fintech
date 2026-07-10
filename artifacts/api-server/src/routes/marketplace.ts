import { Router, type Request } from "express";
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "../lib/firebase-admin.js";
import multer from "multer";
import path from "path";
import { existsSync, mkdirSync, unlinkSync } from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, _file, cb) => {
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`);
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.mimetype));
  },
});

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

async function verifyToken(req: Request): Promise<{ uid: string } | null> {
  const authHeader = req.headers["authorization"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.headers["x-firebase-token"] as string | undefined);
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

const PLATFORM_FEE_PCT = 0.05;

// POST /api/upload-image — receive image file via multipart, save to disk
router.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    const auth = await verifyToken(req);
    if (!auth) {
      if (req.file) unlinkSync(req.file.path);
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image file received. Send field name 'image'." });
      return;
    }
    const url = `/api/product-image/${req.file.filename}`;
    console.log(`[upload-image] saved ${req.file.filename} (${req.file.size} bytes) for ${auth.uid}`);
    res.json({ success: true, url });
  } catch (err) {
    if (req.file) unlinkSync(req.file.path);
    console.error("[upload-image]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/product-image/:filename — serve image from disk (no auth required)
router.get("/product-image/:filename", (req, res) => {
  const filename = path.basename(req.params.filename ?? "");
  if (!filename || filename.includes("..")) { res.status(400).end(); return; }
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!existsSync(filePath)) { res.status(404).end(); return; }
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(filePath);
});

// POST /api/products — create a product listing (verified sellers only)
router.post("/products", async (req, res) => {
  try {
    const auth = await verifyToken(req);
    if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

    const {
      title, description, category, price, quantity, imageUrl, imageUrls,
      hpEnabled, hpDeposit, hpInstallments, hpInstallmentAmount, hpIntervalDays,
    } = req.body as {
      title: string;
      description: string;
      category?: string;
      price: number;
      quantity: number;
      imageUrl?: string;
      imageUrls?: string[];
      hpEnabled?: boolean;
      hpDeposit?: number;
      hpInstallments?: number;
      hpInstallmentAmount?: number;
      hpIntervalDays?: number;
    };

    const hp = hpEnabled === true;
    if (hp) {
      if (!Number.isFinite(Number(hpDeposit)) || Number(hpDeposit) < 10) {
        res.status(400).json({ error: "HP deposit must be at least KES 10" }); return;
      }
      if (!Number.isInteger(Number(hpInstallments)) || Number(hpInstallments) < 1) {
        res.status(400).json({ error: "HP installments must be a positive integer" }); return;
      }
      if (!Number.isFinite(Number(hpInstallmentAmount)) || Number(hpInstallmentAmount) < 10) {
        res.status(400).json({ error: "HP installment amount must be at least KES 10" }); return;
      }
    }

    const titleStr = typeof title === "string" ? title.trim() : "";
    const descStr = typeof description === "string" ? description.trim() : "";
    const priceNum = Number(price);
    const qtyNum = Number(quantity);

    const isValidImageUrl = (u: unknown): u is string =>
      typeof u === "string" && (/^https?:\/\/.+/.test(u.trim()) || u.trim().startsWith("/api/product-image/"));

    const urlList: string[] = Array.isArray(imageUrls)
      ? imageUrls.filter(isValidImageUrl).map(u => u.trim())
      : isValidImageUrl(imageUrl)
        ? [imageUrl.trim()]
        : [];

    if (!titleStr || titleStr.length > 200) {
      res.status(400).json({ error: "title must be a non-empty string (max 200 chars)" });
      return;
    }
    if (!descStr || descStr.length > 2000) {
      res.status(400).json({ error: "description must be a non-empty string (max 2000 chars)" });
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      res.status(400).json({ error: "price must be a positive number" });
      return;
    }
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      res.status(400).json({ error: "quantity must be a positive integer" });
      return;
    }
    if (urlList.length === 0) {
      res.status(400).json({ error: "At least one product photo is required" });
      return;
    }

    const sellerId = auth.uid;
    const db = getAdminFirestore();
    const sellerSnap = await db.collection("users").doc(sellerId).get();
    if (!sellerSnap.exists) { res.status(404).json({ error: "Seller not found" }); return; }
    const sellerData = sellerSnap.data()!;
    if (!sellerData.sellerVerified) {
      res.status(403).json({ error: "Seller is not verified" });
      return;
    }

    const trustScore = sellerData.sellerTrustScore as { score?: number; grade?: string; label?: string } | null;

    const productRef = db.collection("products").doc();
    const product = {
      id: productRef.id,
      sellerId,
      sellerName: sellerData.displayName || sellerData.email || "Unknown",
      sellerPhone: (sellerData.customerPhone as string) || "",
      sellerGrade: trustScore?.grade || "—",
      sellerScore: trustScore?.score || 0,
      businessType: sellerData.businessType || "",
      category: typeof category === "string" ? category.trim() : (sellerData.businessType || ""),
      title: String(title).trim(),
      description: String(description).trim(),
      price: Math.round(Number(price) * 100) / 100,
      currency: "KES",
      quantity: Math.max(1, Math.floor(Number(quantity))),
      imageUrl: urlList[0],
      imageUrls: urlList,
      hpEnabled: hp,
      ...(hp ? {
        hpDeposit: Math.round(Number(hpDeposit) * 100) / 100,
        hpInstallments: Math.floor(Number(hpInstallments)),
        hpInstallmentAmount: Math.round(Number(hpInstallmentAmount) * 100) / 100,
        hpIntervalDays: Number(hpIntervalDays) > 0 ? Math.floor(Number(hpIntervalDays)) : 30,
      } : {}),
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await productRef.set(product);
    console.log(`[marketplace] Product created: ${productRef.id} by seller ${sellerId}`);
    res.json({ success: true, productId: productRef.id, product });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/products — list published products (authenticated buyers only)
router.get("/products", async (req, res) => {
  try {
    const auth = await verifyToken(req);
    if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }
    const db = getAdminFirestore();
    const snap = await db.collection("products")
      .where("status", "==", "published")
      .limit(100)
      .get();
    const products = snap.docs.map(d => d.data())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/products/seller/:sellerId — seller's own products (must be the authenticated user)
router.get("/products/seller/:sellerId", async (req, res) => {
  try {
    const auth = await verifyToken(req);
    if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

    const { sellerId } = req.params;
    if (auth.uid !== sellerId) { res.status(403).json({ error: "Forbidden" }); return; }

    const db = getAdminFirestore();
    const snap = await db.collection("products")
      .where("sellerId", "==", sellerId)
      .get();
    const products = snap.docs.map(d => d.data())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/products/:productId — seller removes their own listing
router.delete("/products/:productId", async (req, res) => {
  try {
    const auth = await verifyToken(req);
    if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

    const { productId } = req.params;
    if (!productId) { res.status(400).json({ error: "productId is required" }); return; }

    const db = getAdminFirestore();
    const snap = await db.collection("products").doc(productId).get();
    if (!snap.exists) { res.status(404).json({ error: "Product not found" }); return; }
    if (snap.data()!.sellerId !== auth.uid) { res.status(403).json({ error: "Not your product" }); return; }

    await db.collection("products").doc(productId).update({
      status: "removed",
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/orders — create order after confirmed M-Pesa payment
router.post("/orders", async (req, res) => {
  try {
    const auth = await verifyToken(req);
    if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

    const { buyerEmail, buyerPhone, productId, paystackRef } = req.body as {
      buyerEmail?: string;
      buyerPhone?: string;
      productId: string;
      paystackRef: string;
    };

    if (!productId || !paystackRef) {
      res.status(400).json({ error: "productId and paystackRef are required" });
      return;
    }

    const buyerId = auth.uid;
    const db = getAdminFirestore();

    // ── Step 1: Verify payment with Paystack (external call, before transaction) ──
    const payData = await ps<{
      status: boolean;
      data?: {
        status: string;
        amount: number;
        reference: string;
        metadata?: { buyerUid?: string; productId?: string };
      };
    }>("GET", `/charge/${encodeURIComponent(paystackRef)}`);

    if (!payData.status || payData.data?.status !== "success") {
      res.status(402).json({ error: "Payment not confirmed by Paystack. Please retry." });
      return;
    }

    // ── Step 1b: Validate Paystack metadata binding (hard-required) ────────────
    // POST /payment/initiate always embeds {buyerUid, productId} in the Paystack
    // charge metadata. Both fields are required here — a charge without them was
    // not initiated through the proper marketplace flow and must be rejected.
    const meta = payData.data?.metadata;
    if (!meta?.buyerUid || !meta?.productId) {
      res.status(403).json({ error: "Payment reference is not bound to a marketplace purchase" });
      return;
    }
    if (meta.buyerUid !== buyerId) {
      res.status(403).json({ error: "Payment reference does not belong to the authenticated buyer" });
      return;
    }
    if (meta.productId !== productId) {
      res.status(400).json({ error: "Payment reference was not initiated for this product" });
      return;
    }

    const paidAmount = payData.data!.amount / 100; // kobo → KES

    // ── Step 2: Atomic Firestore transaction ──────────────────────────────────
    // Deterministic orderId keyed on paystackRef enables direct doc lookup
    // inside the transaction (collection queries are not allowed in transactions).
    const orderId = `pay-${paystackRef.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60)}`;
    const orderRef = db.collection("orders").doc(orderId);
    const productRef = db.collection("products").doc(productId);

    type TxnResult =
      | { outcome: "duplicate" }
      | { outcome: "ok"; product: DocumentData; sellerAmount: number };

    let txnResult: TxnResult;
    try {
      txnResult = await db.runTransaction<TxnResult>(async (txn) => {
        // Read order doc and product doc in the same round-trip
        const [existingOrderSnap, productSnap] = await Promise.all([
          txn.get(orderRef),
          txn.get(productRef),
        ]);

        // Idempotency: order already exists for this payment reference → duplicate
        if (existingOrderSnap.exists) {
          return { outcome: "duplicate" };
        }

        if (!productSnap.exists) throw new Error("PRODUCT_NOT_FOUND");
        const product = productSnap.data()!;

        // Stock check inside transaction — prevents overselling under concurrency
        if (product.status !== "published" || (product.quantity as number) < 1) {
          throw new Error("PRODUCT_UNAVAILABLE");
        }

        // Defensive: reject orders where persisted product price/quantity is corrupted
        const productPrice = Number(product.price);
        const productQty = Number(product.quantity);
        if (!Number.isFinite(productPrice) || productPrice <= 0) {
          throw new Error("PRODUCT_INVALID_PRICE");
        }
        if (!Number.isInteger(productQty) || productQty < 1) {
          throw new Error("PRODUCT_UNAVAILABLE");
        }

        // Amount validation (inside transaction so it's consistent with the product price read)
        if (paidAmount < productPrice - 0.5) {
          throw new Error(`AMOUNT_MISMATCH:${paidAmount}:${productPrice}`);
        }

        const amount = productPrice; // already validated: finite, > 0
        const platformFee = Math.round(amount * PLATFORM_FEE_PCT * 100) / 100;
        const sellerAmount = Math.round((amount - platformFee) * 100) / 100;
        const now = new Date().toISOString();

        // Atomic: decrement stock
        const newQty = (product.quantity as number) - 1;
        txn.update(productRef, {
          quantity: newQty,
          ...(newQty <= 0 ? { status: "sold_out" } : {}),
          updatedAt: now,
        });

        // Atomic: create order (idempotent — same doc ID = same payment ref)
        txn.set(orderRef, {
          id: orderId,
          buyerId,
          buyerEmail: buyerEmail || "",
          buyerPhone: buyerPhone || "",
          sellerId: product.sellerId as string,
          productId,
          productTitle: product.title as string,
          sellerName: product.sellerName as string,
          amount,
          platformFee,
          sellerAmount,
          status: "paid",
          paystackRef,
          transferRef: null,
          transferStatus: "pending",
          createdAt: now,
        });

        return { outcome: "ok", product, sellerAmount };
      });
    } catch (txnErr) {
      const msg = txnErr instanceof Error ? txnErr.message : String(txnErr);
      if (msg === "PRODUCT_NOT_FOUND") {
        res.status(404).json({ error: "Product not found" });
      } else if (msg === "PRODUCT_UNAVAILABLE") {
        res.status(410).json({ error: "Product is no longer available" });
      } else if (msg.startsWith("AMOUNT_MISMATCH:")) {
        const parts = msg.split(":");
        res.status(402).json({
          error: `Paid amount (KES ${parts[1]}) is less than product price (KES ${parts[2]}). Contact support.`,
        });
      } else {
        console.error("[marketplace] transaction error:", msg);
        res.status(500).json({ error: "Order creation failed. Please contact support." });
      }
      return;
    }

    if (txnResult.outcome === "duplicate") {
      res.json({ success: true, orderId, duplicate: true });
      return;
    }

    const { product, sellerAmount } = txnResult;

    // ── Step 3: Post-transaction — seller notification (non-fatal) ─────────────
    const productPrice = product.price as number;
    db.collection("users").doc(product.sellerId as string)
      .collection("notifications").doc(`order-${orderId}`)
      .set({
        id: `order-${orderId}`,
        type: "new_order",
        title: "New order received!",
        body: `Someone purchased "${product.title}" for KES ${productPrice.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Settlement of KES ${sellerAmount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will be initiated.`,
        orderId,
        createdAt: new Date().toISOString(),
        read: false,
      }).catch((e) => console.warn("[marketplace] seller notif write failed:", (e as Error)?.message));

    // ── Step 4: Settlement transfer — only after committed transaction ──────────
    let transferRef: string | null = null;
    try {
      const sellerSnap = await db.collection("users").doc(product.sellerId as string).get();
      const sellerData = sellerSnap.data();
      let recipientCode: string | null = null;

      // 1. Try paystackSubaccountCode — fetch bank/account details from Paystack
      const subaccountCode = sellerData?.paystackSubaccountCode as string | undefined;
      if (subaccountCode) {
        try {
          const subData = await ps<{
            status: boolean;
            data?: { settlement_bank: string; account_number: string; business_name: string };
          }>("GET", `/subaccount/${encodeURIComponent(subaccountCode)}`);
          if (subData.status && subData.data) {
            const recipientData = await ps<{
              status: boolean;
              data?: { recipient_code: string };
            }>("POST", "/transferrecipient", {
              type: "mobile_money",
              name: subData.data.business_name || (sellerData?.displayName as string) || "Seller",
              account_number: subData.data.account_number,
              bank_code: subData.data.settlement_bank,
              currency: "KES",
            });
            if (recipientData.status && recipientData.data?.recipient_code) {
              recipientCode = recipientData.data.recipient_code;
              console.log(`[marketplace] Recipient from subaccount ${subaccountCode}`);
            }
          }
        } catch (subErr) {
          console.warn("[marketplace] subaccount lookup failed:", subErr instanceof Error ? subErr.message : String(subErr));
        }
      }

      // 2. Fall back to verifiedMpesaWallet
      if (!recipientCode) {
        const rawWallet = sellerData?.verifiedMpesaWallet as string | undefined;
        if (rawWallet) {
          const digits = rawWallet.replace(/\D/g, "");
          const normalised = digits.startsWith("0") && digits.length === 10
            ? "254" + digits.slice(1)
            : digits.startsWith("254") && digits.length === 12
            ? digits
            : digits.length === 9 ? "254" + digits : digits;
          const recipientData = await ps<{
            status: boolean;
            data?: { recipient_code: string };
          }>("POST", "/transferrecipient", {
            type: "mobile_money",
            name: (sellerData?.displayName as string) || "Seller",
            account_number: normalised,
            bank_code: "MPESA",
            currency: "KES",
          });
          if (recipientData.status && recipientData.data?.recipient_code) {
            recipientCode = recipientData.data.recipient_code;
            console.log(`[marketplace] Recipient from verifiedMpesaWallet`);
          }
        }
      }

      if (recipientCode) {
        const transferData = await ps<{
          status: boolean;
          data?: { reference: string };
        }>("POST", "/transfer", {
          source: "balance",
          amount: Math.round(sellerAmount * 100),
          recipient: recipientCode,
          currency: "KES",
          reason: `Doyang order ${orderId}`,
        });
        if (transferData.status && transferData.data?.reference) {
          transferRef = transferData.data.reference;
          await orderRef.update({ transferRef, transferStatus: "initiated" });
          console.log(`[marketplace] Transfer initiated: ${transferRef} → seller ${product.sellerId}`);
        }
      } else {
        console.warn(`[marketplace] No payout method for seller ${product.sellerId as string}; needs manual settlement`);
        await orderRef.update({ transferStatus: "needs_manual_settlement" });
      }
    } catch (transferErr) {
      console.warn("[marketplace] Settlement transfer failed (non-fatal):",
        transferErr instanceof Error ? transferErr.message : String(transferErr));
    }

    res.json({ success: true, orderId, transferRef });
  } catch (err) {
    console.error("[marketplace] order creation error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/orders/seller/:sellerId — seller's incoming orders (must be the authenticated user)
router.get("/orders/seller/:sellerId", async (req, res) => {
  try {
    const auth = await verifyToken(req);
    if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

    const { sellerId } = req.params;
    if (auth.uid !== sellerId) { res.status(403).json({ error: "Forbidden" }); return; }

    const db = getAdminFirestore();
    const snap = await db.collection("orders")
      .where("sellerId", "==", sellerId)
      .get();
    const orders = snap.docs.map(d => d.data())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
