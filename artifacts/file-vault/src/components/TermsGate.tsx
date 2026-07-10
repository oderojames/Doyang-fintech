import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ShieldCheck, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TOS_KEY = 'doyang_tos_accepted_v1';

export default function TermsGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setAccepted(localStorage.getItem(TOS_KEY) === 'true');
    } catch {
      setAccepted(false);
    }
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledToEnd(true);
    }
  };

  const handleAccept = () => {
    try {
      localStorage.setItem(TOS_KEY, 'true');
    } catch {
      /* ignore storage errors */
    }
    setAccepted(true);
  };

  // Still reading storage — render nothing to avoid flashing the app before the check completes.
  if (accepted === null) return null;

  if (accepted) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />

      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 mb-3">
            <ShieldCheck size={24} className="text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Welcome to Doyang</h1>
          <p className="text-sm text-muted-foreground mt-1">Please review and accept our Terms of Service to continue</p>
        </div>

        {/* Scrollable terms */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm text-muted-foreground leading-relaxed"
        >
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <FileText size={16} className="text-primary" />
            Terms of Service
          </div>

          <section className="space-y-2">
            <h2 className="text-foreground font-semibold">1. About Doyang</h2>
            <p>
              Doyang is a creditworthiness platform that helps retailers and wholesalers understand
              business credit standing using M-Pesa transaction history. The app analyses a statement
              you provide and produces a credit assessment report with a score, grade, and a suggested
              credit limit.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-foreground font-semibold">2. Services We Provide</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="text-foreground">Statement analysis</span> — we read the M-Pesa statement you upload and calculate cash-flow, turnover, transaction frequency, business activity and risk indicators.</li>
              <li><span className="text-foreground">Credit report</span> — we generate a score (out of 100), a grade (A–E) and a recommended credit limit based on that analysis.</li>
              <li><span className="text-foreground">Retailer portal</span> — assess your own business credit standing and grow access to credit.</li>
              <li><span className="text-foreground">Wholesaler portal</span> — view credit assessments and reports for retailers who have chosen to share them with you.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-foreground font-semibold">3. Your Privacy &amp; Data</h2>
            <p>
              Your raw M-Pesa statement is <span className="text-foreground font-medium">never stored</span> — only
              the resulting analysis report is saved to your account. We process your data solely to
              produce your credit assessment.
            </p>
          </section>

          <section className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h2 className="text-foreground font-semibold">4. Report Visibility — Important</h2>
            <p>
              You acknowledge and agree that <span className="text-foreground font-medium">your report results
              are displayed and shared strictly according to your own settings</span>. You control whether your
              report is visible, and to which wholesaler(s) it is shared. Doyang shows your report to others
              only based on the visibility preferences you select in your account. You are responsible for
              keeping these settings up to date.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-foreground font-semibold">5. Accuracy &amp; Decisions</h2>
            <p>
              Credit assessments are estimates generated from the data you provide and are intended as a
              decision-support tool. They are not a guarantee of credit. Any lending decision made using a
              Doyang report remains the responsibility of the parties involved.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-foreground font-semibold">6. Acceptable Use</h2>
            <p>
              You agree to provide accurate information, to only upload statements you are authorised to use,
              and not to misuse the platform. Accounts found to be abusing the service may be suspended.
            </p>
          </section>

          <p className="text-xs text-muted-foreground/80 pt-2">
            By selecting “I have read and accept” below, you confirm that you have read, understood and agree
            to these Terms of Service, including how your report results are displayed according to your settings.
          </p>
        </div>

        {/* Footer / accept */}
        <div className="p-6 pt-4 border-t border-border space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => setChecked(c => !c)}
              className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                checked ? 'bg-primary border-primary text-white' : 'border-primary/60 bg-background hover:border-primary'
              }`}
            >
              {checked && <Check size={14} />}
            </button>
            <span className="text-sm text-foreground">
              I have read and accept the Terms of Service, and I understand that my report results appear
              according to my own settings.
            </span>
          </label>

          {!scrolledToEnd && (
            <p className="text-xs text-muted-foreground text-center">Scroll to the end of the terms to continue.</p>
          )}

          <Button
            onClick={handleAccept}
            disabled={!checked || !scrolledToEnd}
            className="w-full font-semibold"
          >
            Accept &amp; Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
