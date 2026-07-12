import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import Vault from "@/pages/Vault";
import AuthPage from "@/pages/AuthPage";
import HomePage from "@/pages/HomePage";
import WholesalerPage from "@/pages/WholesalerPage";
import BuyerAuthPage from "@/pages/BuyerAuthPage";
import MarketplaceView from "@/components/MarketplaceView";
import NotificationCenter from "@/components/NotificationCenter";
import CompleteProfileScreen from "@/components/CompleteProfileScreen";
import CardOnboarding from "@/components/CardOnboarding";
import TermsGate from "@/components/TermsGate";
import ContactWidget from "@/components/ContactWidget";
import Chatbot from "@/components/Chatbot";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import NotFound from "@/pages/not-found";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfUse from "@/pages/TermsOfUse";
import { Building2, ShieldCheck, Mail, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

const queryClient = new QueryClient();

function WrongPortalScreen({
  accountRole,
  targetPortal,
  targetHref,
  targetIcon,
  targetColor,
}: {
  accountRole: 'retailer' | 'wholesaler';
  targetPortal: string;
  targetHref: string;
  targetIcon: React.ReactNode;
  targetColor: string;
}) {
  const { signOut } = useAuth();
  const [, navigate] = useLocation();
  const portalLabel = accountRole === 'wholesaler' ? 'Wholesaler' : 'Retailer';
  const wrongLabel  = accountRole === 'wholesaler' ? 'Retailer'   : 'Wholesaler';

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl border ${targetColor}`}>
          {targetIcon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Wrong Portal</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Your account is registered as a{' '}
            <span className="font-semibold text-foreground">{portalLabel}</span>.
            This is the <span className="font-semibold text-foreground">{wrongLabel} Portal</span>.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <a
            href={targetHref}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 transition-colors text-sm"
          >
            {targetIcon}
            Go to {targetPortal}
          </a>
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted text-foreground font-semibold py-2.5 px-4 transition-colors text-sm"
          >
            Sign out &amp; switch account
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailVerificationScreen({ accentClass = 'text-primary', borderClass = 'border-primary/30', bgClass = 'bg-primary/20' }: { accentClass?: string; borderClass?: string; bgClass?: string }) {
  const { user, signOut, sendVerificationEmail, reloadUser } = useAuth();
  const [, navigate] = useLocation();
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'not-yet'>('idle');

  // Auto-verify when the user lands back on the app after clicking the link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') !== '1') return;
    // Clean the param from the URL without a page reload
    const clean = new URL(window.location.href);
    clean.searchParams.delete('verified');
    window.history.replaceState({}, '', clean.toString());
    // Reload auth state — if verified, setUser is called and the gate lifts
    setCheckStatus('checking');
    reloadUser().then((ok) => {
      if (!ok) {
        setCheckStatus('not-yet');
        setTimeout(() => setCheckStatus('idle'), 3000);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResend = async () => {
    setResendStatus('sending');
    try {
      await sendVerificationEmail();
      setResendStatus('sent');
      setTimeout(() => setResendStatus('idle'), 4000);
    } catch {
      setResendStatus('error');
      setTimeout(() => setResendStatus('idle'), 3000);
    }
  };

  const handleContinue = async () => {
    setCheckStatus('checking');
    const verified = await reloadUser();
    if (!verified) {
      setCheckStatus('not-yet');
      setTimeout(() => setCheckStatus('idle'), 3000);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl text-center space-y-5">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${bgClass} border ${borderClass} mx-auto`}>
            <Mail size={30} className={accentClass} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Verify your email</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We sent a verification link to{' '}
              <span className="font-semibold text-foreground">{user?.email}</span>.
              <br />Open it to activate your account, then click <em>Continue</em>.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={handleContinue}
              disabled={checkStatus === 'checking'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 transition-colors text-sm disabled:opacity-60"
            >
              {checkStatus === 'checking' ? (
                <><RefreshCw size={14} className="animate-spin" /> Checking…</>
              ) : (
                <><CheckCircle2 size={14} /> I've verified — Continue</>
              )}
            </button>

            {checkStatus === 'not-yet' && (
              <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 justify-center">
                <AlertCircle size={13} />
                Email not verified yet. Please click the link in your inbox first.
              </div>
            )}

            <button
              onClick={handleResend}
              disabled={resendStatus === 'sending' || resendStatus === 'sent'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted text-foreground font-medium py-2.5 px-4 transition-colors text-sm disabled:opacity-60"
            >
              {resendStatus === 'sending' ? 'Sending…' : resendStatus === 'sent' ? '✓ Email resent!' : 'Resend verification email'}
            </button>

            <button
              onClick={async () => { await signOut(); navigate('/'); }}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RetailerPortal() {
  const { user, loading, profileComplete, needsCardOnboarding, completeCardOnboarding } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  if (!user.emailVerified) return <EmailVerificationScreen />;

  if (profileComplete === false) return <CompleteProfileScreen role="retailer" />;

  if (needsCardOnboarding) return <CardOnboarding onComplete={completeCardOnboarding} />;

  if (user.role === 'wholesaler') {
    return (
      <WrongPortalScreen
        accountRole="wholesaler"
        targetPortal="Wholesaler Portal"
        targetHref="/wholesaler"
        targetIcon={<Building2 size={28} className="text-amber-400" />}
        targetColor="bg-amber-500/20 border-amber-500/30"
      />
    );
  }

  return <Vault />;
}

function BuyerPortal() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <BuyerAuthPage />;

  if (!user.emailVerified) {
    return (
      <EmailVerificationScreen
        accentClass="text-green-400"
        borderClass="border-green-500/30"
        bgClass="bg-green-500/20"
      />
    );
  }

  if (user.role && user.role !== 'buyer') {
    return (
      <WrongPortalScreen
        accountRole={user.role as 'retailer' | 'wholesaler'}
        targetPortal={user.role === 'wholesaler' ? 'Wholesaler Portal' : 'Retailer Portal'}
        targetHref={user.role === 'wholesaler' ? '/wholesaler' : '/retailer'}
        targetIcon={user.role === 'wholesaler'
          ? <Building2 size={28} className="text-amber-400" />
          : <ShieldCheck size={28} className="text-primary" />}
        targetColor={user.role === 'wholesaler'
          ? 'bg-amber-500/20 border-amber-500/30'
          : 'bg-primary/20 border-primary/30'}
      />
    );
  }

  return (
    <div className="relative">
      <div className="absolute top-3 right-3 z-50">
        <NotificationCenter />
      </div>
      <MarketplaceView />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/retailer" component={RetailerPortal} />
      <Route path="/wholesaler" component={WholesalerPage} />
      <Route path="/buyer" component={BuyerPortal} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfUse} />
      <Route component={NotFound} />
    </Switch>
  );
}

const RETAILER_FEATURES = [
  "Upload your M-Pesa statement (PDF) — it's encrypted in transit and never stored; only the analysis report is saved.",
  "Get a credit report with a score (out of 100), a grade (A–E) and a recommended credit limit.",
  "Review key metrics from your statement: cash flow, turnover, transaction frequency, business activity and risk factors.",
  "See your statement period and the number of transactions analysed.",
  "Control who sees your report — keep it private, make it visible, or share it with specific wholesalers.",
  "Open or delete any of your past analyses.",
];

const WHOLESALER_FEATURES = [
  "View credit reports for retailers who have shared with you — score, grade and recommended limit.",
  "See each retailer's business name, business type, owner contact, phone, email (tap the email to write a message), statement period and date added.",
  "Search to quickly find a specific retailer.",
  "Track how many report slots you've used against your quota.",
  "Upgrade your slot limit via M-Pesa to unlock more retailer reports.",
];

function FloatingHelp() {
  const [location] = useLocation();
  if (location.startsWith("/retailer")) {
    return (
      <Chatbot
        key="retailer"
        screenName="Retailer Portal"
        screenContext="The Retailer Portal (Credit Vault). Retailers upload their M-Pesa statement (PDF) to receive a credit assessment. The statement is encrypted in transit and never stored — only the resulting report is saved. The report shows a credit score out of 100, a grade from A to E, a recommended credit limit, and metrics such as cash flow, turnover, transaction frequency, business activity and risk factors, plus the statement period and number of transactions. Retailers control report visibility (private, visible, or shared with specific wholesalers) and can open or delete past analyses."
        features={RETAILER_FEATURES}
      />
    );
  }
  if (location.startsWith("/wholesaler")) {
    return (
      <Chatbot
        key="wholesaler"
        screenName="Wholesaler Portal"
        screenContext="The Wholesaler Portal (Retailers Managed dashboard). Wholesalers view credit reports for retailers who have shared with them, including score, grade and recommended credit limit. Each entry shows the retailer's business name, the business type the retailer chose (e.g. their industry/category), owner contact, phone, email (a clickable mailto link), the M-Pesa statement period and the date added. IMPORTANT: wholesalers CANNOT manually add a retailer — there is no 'add retailer' button. A retailer appears here automatically only after that retailer uploads their M-Pesa statement and chooses to make their report public or share it with this wholesaler. Wholesalers can search the retailers they already have. There is a free quota of report slots; once it is reached, extra retailers are locked and the wholesaler can pay via M-Pesa to upgrade their slot limit and unlock more reports. Email must be verified to access the dashboard."
        features={WHOLESALER_FEATURES}
      />
    );
  }
  return <ContactWidget />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <NotificationProvider>
            <TermsGate>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
                <FloatingHelp />
              </WouterRouter>
            </TermsGate>
          </NotificationProvider>
        </AuthProvider>
        <Toaster />
        <PWAInstallPrompt />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
