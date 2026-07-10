const PAYSTACK_BASE = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured on server");
  return key;
}

export async function paystackRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<T>;
}

// ── Create a Paystack subaccount for a wholesaler ────────────────────────────
export async function createSubaccount(
  businessName: string,
  settlementBank: string,
  accountNumber: string,
  description?: string,
): Promise<{ success: boolean; subaccountCode?: string; error?: string }> {
  try {
    const data = await paystackRequest<{
      status: boolean;
      message: string;
      data?: { subaccount_code: string; id: number };
    }>("POST", "/subaccount", {
      business_name: businessName,
      settlement_bank: settlementBank,
      account_number: accountNumber,
      percentage_charge: 100,
      description: description ?? businessName,
    });
    if (!data.status || !data.data?.subaccount_code) {
      return { success: false, error: data.message ?? "Subaccount creation failed" };
    }
    return { success: true, subaccountCode: data.data.subaccount_code };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Network error creating subaccount",
    };
  }
}

// ── Create a percentage-based transaction split ───────────────────────────────
// wholesalerSharePct (default 90) goes to the wholesaler's subaccount.
// The remaining percentage (default 10) stays in the platform account.
// bearer_type "account" means Paystack fees are deducted from the platform share.
export async function createTransactionSplit(
  offerId: string,
  wholesalerSubaccountCode: string,
  wholesalerSharePct = 90
): Promise<{ success: boolean; splitCode?: string; error?: string }> {
  try {
    const data = await paystackRequest<{
      status: boolean;
      message: string;
      data?: { split_code: string; id: number };
    }>("POST", "/split", {
      name: `Doyang Loan ${offerId}`,
      type: "percentage",
      currency: "KES",
      bearer_type: "account",
      subaccounts: [{ subaccount: wholesalerSubaccountCode, share: wholesalerSharePct }],
    });

    if (!data.status || !data.data?.split_code) {
      return { success: false, error: data.message ?? "Split creation failed" };
    }
    return { success: true, splitCode: data.data.split_code };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Network error creating split",
    };
  }
}

// ── Recurring card charge via saved authorization ─────────────────────────────
// Pass splitCode to apply a pre-configured transaction split automatically.
export async function chargeAuthorization(
  email: string,
  amountKes: number,
  authorizationCode: string,
  metadata: Record<string, unknown>,
  splitCode?: string | null
): Promise<{ success: boolean; reference?: string; error?: string }> {
  try {
    const amountKobo = Math.round(amountKes * 100); // KES → smallest unit (kobo)

    // Paystack rejects charges below their minimum for KES (100 kobo = KES 1 is too low).
    // Enforce a sensible minimum so the error is explicit rather than a generic bank decline.
    const MIN_KOBO = 1000; // KES 10 minimum
    if (amountKobo < MIN_KOBO) {
      console.warn(
        `[paystack] charge_authorization SKIPPED — amount ${amountKobo} kobo (KES ${amountKes}) ` +
        `is below the minimum of ${MIN_KOBO} kobo (KES ${MIN_KOBO / 100})`
      );
      return {
        success: false,
        error: `Charge amount KES ${amountKes.toFixed(2)} is below Paystack's minimum of KES ${MIN_KOBO / 100}`,
      };
    }

    const body: Record<string, unknown> = {
      email,
      amount: amountKobo,
      authorization_code: authorizationCode,
      currency: "KES",
      metadata,
    };
    if (splitCode) body["split_code"] = splitCode;

    console.log(
      `[paystack] charge_authorization → email: ${email}, amount: ${amountKobo} kobo (KES ${amountKes}), ` +
      `auth: ${authorizationCode.slice(0, 12)}…, split: ${splitCode ?? "none"}`
    );

    const data = await paystackRequest<{
      status: boolean;
      message?: string;
      data?: {
        status: string;
        reference: string;
        gateway_response?: string;
        channel?: string;
        currency?: string;
        amount?: number;
      };
    }>("POST", "/transaction/charge_authorization", body);

    console.log(
      `[paystack] charge_authorization ← status: ${data.status}, ` +
      `txn_status: ${data.data?.status ?? "n/a"}, ` +
      `gateway_response: "${data.data?.gateway_response ?? "n/a"}", ` +
      `message: "${data.message ?? "n/a"}", ` +
      `ref: ${data.data?.reference ?? "n/a"}`
    );

    if (data.status && data.data?.status === "success") {
      return { success: true, reference: data.data.reference };
    }

    // Use Paystack's own gateway_response (e.g. "Insufficient Funds", "Do Not Honour", "Invalid Card")
    // before falling back to the top-level message or a generic label.
    const failReason =
      data.data?.gateway_response
      ?? (data.data?.status === "failed" ? "Charge declined by bank" : undefined)
      ?? data.message
      ?? "Paystack charge was not successful";

    return { success: false, error: failReason };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Network error contacting Paystack",
    };
  }
}
