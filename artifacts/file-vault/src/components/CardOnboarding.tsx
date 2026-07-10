import { useState, useEffect } from "react";
import { CreditCard, Shield, RefreshCw, X, CheckCircle2 } from "lucide-react";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

interface PaystackAuthorization {
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
}

declare global {
  interface Window {
    PaystackPop: {
      setup(opts: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        channels: string[];
        onClose: () => void;
        callback: (response: { reference: string }) => void;
      }): { openIframe(): void };
    };
  }
}

function usePaystackScript() {
  const [ready, setReady] = useState(!!window.PaystackPop);
  useEffect(() => {
    if (window.PaystackPop) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

interface Props {
  onComplete: () => void;
}

export default function CardOnboarding({ onComplete }: Props) {
  const { user, markCardConnected } = useAuth();
  const scriptReady = usePaystackScript();
  const [status, setStatus] = useState<"idle" | "loading" | "verifying" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const markDone = async (authorization?: PaystackAuthorization) => {
    if (!user) return;
    const update: Record<string, unknown> = { cardOnboardingDone: true };
    if (authorization) {
      update.paystackAuth = authorization;
      update.cardConnected = true;
      markCardConnected();
    } else {
      update.cardConnected = false;
      // User skipped — create the card-required notification immediately.
      // onAuthStateChanged fired before the user doc existed, so the notification
      // check was skipped. We create it here to ensure it appears in the vault.
      setDoc(
        doc(db, "users", user.uid, "notifications", "card-required"),
        {
          id: "card-required",
          type: "card_required",
          title: "Connect a repayment card",
          body: "A verified payment card is required before wholesalers can extend credit to you through Doyang.",
          createdAt: new Date().toISOString(),
          read: false,
        }
      ).catch(() => {});
    }
    await updateDoc(doc(db, "users", user.uid), update).catch(() => {});
    onComplete();
  };

  const verifyAndSave = (reference: string) => {
    setStatus("verifying");
    fetch("/api/paystack/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Verification failed");
        return r.json() as Promise<{ authorization: PaystackAuthorization }>;
      })
      .then(({ authorization }) => {
        setStatus("success");
        markDone(authorization);
      })
      .catch((e: unknown) => {
        setErrorMsg(e instanceof Error ? e.message : "Verification failed. Please try again.");
        setStatus("error");
      });
  };

  const handleConnect = () => {
    if (!scriptReady || !user?.email) return;
    setStatus("loading");
    setErrorMsg("");
    const ref = `card-${user.uid}-${Date.now()}`;
    const handler = window.PaystackPop.setup({
      key: PUBLIC_KEY,
      email: user.email,
      amount: 2000,
      currency: "KES",
      ref,
      channels: ["card"],
      onClose: () => setStatus("idle"),
      callback: (response) => {
        verifyAndSave(response.reference);
      },
    });
    handler.openIframe();
  };

  const handleSkip = () => markDone();

  if (status === "success") {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-foreground">Card Connected!</h2>
          <p className="text-sm text-muted-foreground">Your repayment card has been securely saved. Automatic repayments are now enabled.</p>
          <div className="animate-pulse text-xs text-muted-foreground">Taking you to your dashboard…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-primary/20 to-primary/5 border-b border-border px-8 pt-8 pb-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
              <CreditCard size={28} className="text-primary" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-foreground">Connect a Repayment Card</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Connecting a payment card enables automatic repayment of future loans extended to you by wholesalers through Doyang.
          </p>
        </div>

        <div className="px-8 py-6 space-y-4">
          <div className="space-y-3">
            {[
              { icon: Shield, text: "Your card details go directly to Paystack — we never see or store raw card numbers." },
              { icon: RefreshCw, text: "A small KES 20 verification charge is made which can be refunded on request." },
              { icon: CreditCard, text: "Your card will only be charged for authorized loan repayments you agree to." },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={13} className="text-primary/70" />
                </div>
                <p className="leading-snug">{text}</p>
              </div>
            ))}
          </div>

          {status === "error" && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2.5">
              <X size={14} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{errorMsg}</p>
            </div>
          )}

          <div className="pt-2 space-y-2.5">
            <button
              onClick={handleConnect}
              disabled={!scriptReady || status === "loading" || status === "verifying"}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "loading" ? (
                <><div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" /> Opening Paystack…</>
              ) : status === "verifying" ? (
                <><div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" /> Verifying card…</>
              ) : (
                <><CreditCard size={15} /> Connect Card</>
              )}
            </button>

            <button
              onClick={handleSkip}
              disabled={status === "loading" || status === "verifying"}
              className="w-full h-9 rounded-xl text-muted-foreground text-sm hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Skip for Now
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground/60 text-center">
            You can connect a card later from your account settings.
          </p>
        </div>
      </div>
    </div>
  );
}
