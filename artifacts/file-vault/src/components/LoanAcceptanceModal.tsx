import { useState, useEffect } from 'react';
import { X, Shield, RefreshCw, CreditCard, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

interface ScheduleItem {
  no: number; dueDate: string; interest: number;
  principal: number; payment: number; balance: number;
}

export interface LoanOfferForActivation {
  id: string;
  wholesalerName: string;
  principal: number;
  interestRate: number;
  interestType: 'flat' | 'reducing';
  repaymentFrequency: 'weekly' | 'biweekly' | 'monthly';
  installments: number;
  startDate: string;
  totalRepayable: number;
  totalInterest: number;
  schedule: ScheduleItem[];
}

export interface CardInfo {
  last4?: string;
  card_type?: string;
  bank?: string;
}

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
        key: string; email: string; amount: number; currency: string; ref: string;
        channels: string[]; onClose: () => void; callback: (r: { reference: string }) => void;
      }): { openIframe(): void };
    };
  }
}

function usePaystackScript() {
  const [ready, setReady] = useState(!!window.PaystackPop);
  useEffect(() => {
    if (window.PaystackPop) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.async = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

type Step = 'agreement' | 'repayments' | 'payment' | 'activating' | 'success';
type ConnectStatus = 'idle' | 'opening' | 'verifying' | 'error';

const FREQ: Record<string, string> = { weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly' };
const FREQ_CAP: Record<string, string> = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' };

function kes(n: number) {
  return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(iso: string) {
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer" onClick={onChange}>
      <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
        ${checked ? 'bg-green-500 border-green-500' : 'border-border hover:border-green-400'}`}>
        {checked && <CheckCircle2 size={11} className="text-white" />}
      </div>
      <span className="text-xs text-foreground leading-relaxed select-none">{label}</span>
    </label>
  );
}

interface Props {
  offer: LoanOfferForActivation;
  cardInfo: CardInfo | null;
  onClose: () => void;
  onActivated: () => void;
}

export default function LoanAcceptanceModal({ offer, cardInfo, onClose, onActivated }: Props) {
  const { user, markCardConnected } = useAuth();
  const scriptReady = usePaystackScript();

  const [step, setStep] = useState<Step>('agreement');
  const [okAgreement, setOkAgreement] = useState(false);
  const [okRepayments, setOkRepayments] = useState(false);
  const [okPayment, setOkPayment] = useState(false);
  const [error, setError] = useState('');

  const [localCard, setLocalCard] = useState<CardInfo | null>(cardInfo);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>('idle');
  const [connectError, setConnectError] = useState('');

  const cardConnected = !!(localCard?.last4);

  const perInstallment = offer.schedule[0]?.payment ?? 0;
  const lastDate = offer.schedule.at(-1)?.dueDate ?? offer.startDate;
  const isInteractive = step !== 'activating' && step !== 'success';

  const stepIndex = ['agreement', 'repayments', 'payment'].indexOf(step);

  const handleConnect = () => {
    if (!scriptReady || !user?.email) return;
    setConnectStatus('opening');
    setConnectError('');
    const ref = `card-${user.uid}-${Date.now()}`;
    const handler = window.PaystackPop.setup({
      key: PUBLIC_KEY,
      email: user.email,
      amount: 2000,
      currency: 'KES',
      ref,
      channels: ['card'],
      onClose: () => setConnectStatus('idle'),
      callback: (response) => {
        setConnectStatus('verifying');
        fetch('/api/paystack/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: response.reference }),
        })
          .then(r => {
            if (!r.ok) throw new Error('Verification failed');
            return r.json() as Promise<{ authorization: PaystackAuthorization }>;
          })
          .then(async ({ authorization }) => {
            await updateDoc(doc(db, 'users', user.uid), {
              cardOnboardingDone: true,
              cardConnected: true,
              paystackAuth: authorization,
            });
            markCardConnected();
            setLocalCard({
              last4: authorization.last4,
              card_type: authorization.card_type,
              bank: authorization.bank,
            });
            setConnectStatus('idle');
          })
          .catch((e: unknown) => {
            setConnectError(e instanceof Error ? e.message : 'Verification failed. Please try again.');
            setConnectStatus('error');
          });
      },
    });
    handler.openIframe();
  };

  const activate = async () => {
    setStep('activating');
    setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in. Please sign in and try again.');

      const res = await fetch(`/api/loan-offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Firebase-Token': token },
        body: JSON.stringify({
          status: 'active',
          confirmations: { loanAgreement: true, recurringRepayments: true, paystackAuthorization: true },
        }),
      });

      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`);

      // Safety net: after activation, ensure the Paystack split was created.
      // The server creates it during the PATCH, but if it failed silently (e.g.
      // wholesaler had no subaccount yet), repair-split retries without blocking
      // the success screen for the retailer.
      auth.currentUser?.getIdToken().then(t => {
        if (!t) return;
        fetch(`/api/loan-offers/${offer.id}/repair-split`, {
          method: 'POST',
          headers: { 'X-Firebase-Token': t },
        }).catch(() => {});
      }).catch(() => {});

      setStep('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation failed. Please try again.');
      setStep('payment');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[95vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <Shield size={18} className="text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Activate Credit Offer</p>
              <p className="text-xs text-muted-foreground">from {offer.wholesalerName}</p>
            </div>
          </div>
          {isInteractive && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Step bar */}
        {stepIndex >= 0 && (
          <div className="px-5 pt-4 pb-1 shrink-0">
            <div className="flex items-center">
              {(['Loan Agreement', 'Repayments', 'Payment Method'] as const).map((label, i) => (
                <div key={label} className="flex items-center flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors
                    ${i < stepIndex ? 'bg-green-500 text-white' : i === stepIndex ? 'bg-amber-500 text-black' : 'bg-muted border border-border text-muted-foreground'}`}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <span className={`text-[10px] ml-1.5 font-medium ${i === stepIndex ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                  {i < 2 && <div className="h-px flex-1 mx-2 bg-border" />}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* ── Step 1: Loan Agreement ── */}
          {step === 'agreement' && (
            <>
              <div>
                <h3 className="text-base font-bold text-foreground">Loan Agreement</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Review the full terms before agreeing.</p>
              </div>

              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {[
                  ['Lender', offer.wholesalerName],
                  ['Principal', kes(offer.principal)],
                  ['Interest rate', `${offer.interestRate}% per installment (${offer.interestType})`],
                  ['Frequency', FREQ_CAP[offer.repaymentFrequency]],
                  ['Installments', `${offer.installments}`],
                  ['Per installment', kes(perInstallment)],
                  ['First payment', fmt(offer.startDate)],
                  ['Last payment', fmt(lastDate)],
                  ['Total interest', kes(offer.totalInterest)],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">{l}</span>
                    <span className="text-xs font-semibold text-foreground text-right max-w-[58%]">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-4 py-3 bg-muted/20">
                  <span className="text-sm font-bold text-foreground">Total repayable</span>
                  <span className="text-sm font-bold text-foreground">{kes(offer.totalRepayable)}</span>
                </div>
              </div>

              <Checkbox
                checked={okAgreement}
                onChange={() => setOkAgreement(v => !v)}
                label="I have read and agree to the full terms of this loan agreement. I understand my repayment obligations and the schedule set out above."
              />

              <button onClick={() => setStep('repayments')} disabled={!okAgreement}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Continue to Step 2
              </button>
            </>
          )}

          {/* ── Step 2: Recurring Repayments ── */}
          {step === 'repayments' && (
            <>
              <div>
                <h3 className="text-base font-bold text-foreground">Authorize Recurring Repayments</h3>
                <p className="text-xs text-muted-foreground mt-0.5">You are authorizing automatic deductions on the schedule below.</p>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <RefreshCw size={14} />
                  Automatic Recurring Repayments
                </div>
                <p className="text-sm text-foreground">
                  <span className="font-bold">{kes(perInstallment)}</span>{' '}
                  charged <span className="font-semibold">{FREQ[offer.repaymentFrequency]}</span>, starting{' '}
                  <span className="font-semibold">{fmt(offer.startDate)}</span>, for{' '}
                  <span className="font-semibold">{offer.installments} installments</span>.
                </p>
                <div className="pt-1 border-t border-amber-500/20 flex justify-between text-xs">
                  <span className="text-muted-foreground">Total charged over loan period</span>
                  <span className="font-bold text-foreground">{kes(offer.totalRepayable)}</span>
                </div>
              </div>

              <Checkbox
                checked={okRepayments}
                onChange={() => setOkRepayments(v => !v)}
                label={`I authorize automatic recurring repayments of ${kes(perInstallment)} ${FREQ[offer.repaymentFrequency]}, starting ${fmt(offer.startDate)}, until all ${offer.installments} installments are fully paid.`}
              />

              <div className="flex gap-2">
                <button onClick={() => setStep('agreement')}
                  className="flex-1 py-2.5 rounded-lg border border-border hover:bg-muted text-foreground font-medium text-sm transition-colors">
                  Back
                </button>
                <button onClick={() => setStep('payment')} disabled={!okRepayments}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Continue to Step 3
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Payment Method ── */}
          {step === 'payment' && (
            <>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {cardConnected ? 'Confirm Payment Method' : 'Connect a Payment Card'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cardConnected
                    ? 'Repayments will be charged to your registered card.'
                    : 'A payment card is required before your loan can be activated.'}
                </p>
              </div>

              {/* ── No card: require connection ── */}
              {!cardConnected && (
                <>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                        <CreditCard size={16} className="text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">No payment card on file</p>
                        <p className="text-xs text-muted-foreground">Connect a card to enable automatic repayments.</p>
                      </div>
                    </div>

                    <div className="border-t border-amber-500/20 pt-3 space-y-2">
                      {[
                        { icon: Shield, text: 'Your card details go directly to Paystack — we never store raw card numbers.' },
                        { icon: RefreshCw, text: 'A KES 20 verification charge is made and can be refunded on request.' },
                        { icon: CreditCard, text: 'Your card will only be charged for loan repayments you have agreed to.' },
                      ].map(({ icon: Icon, text }, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon size={11} className="text-amber-400/70" />
                          </div>
                          <p className="leading-snug">{text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {connectError && (
                    <div className="flex items-start gap-2 text-destructive text-xs px-3 py-2.5">
                      <AlertCircle size={13} className="shrink-0 mt-0.5" />
                      <span>{connectError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleConnect}
                    disabled={!scriptReady || connectStatus === 'opening' || connectStatus === 'verifying'}
                    className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {connectStatus === 'opening' ? (
                      <><Loader2 size={14} className="animate-spin" /> Opening Paystack…</>
                    ) : connectStatus === 'verifying' ? (
                      <><Loader2 size={14} className="animate-spin" /> Verifying card…</>
                    ) : (
                      <><CreditCard size={14} /> Connect Card via Paystack</>
                    )}
                  </button>

                  <div className="flex gap-2">
                    <button onClick={() => setStep('repayments')}
                      className="flex-1 py-2.5 rounded-lg border border-border hover:bg-muted text-foreground font-medium text-sm transition-colors">
                      Back
                    </button>
                  </div>
                </>
              )}

              {/* ── Card connected: confirm + activate ── */}
              {cardConnected && (
                <>
                  <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
                      <CreditCard size={18} className="text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">
                        {(localCard?.card_type ?? 'Card').charAt(0).toUpperCase() +
                          (localCard?.card_type ?? 'Card').slice(1)} •••• {localCard?.last4}
                      </p>
                      {localCard?.bank && <p className="text-xs text-muted-foreground">{localCard.bank}</p>}
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-green-500/15 border border-green-500/30 text-green-400 shrink-0">
                      <CheckCircle2 size={9} /> Verified
                    </span>
                  </div>

                  <Checkbox
                    checked={okPayment}
                    onChange={() => setOkPayment(v => !v)}
                    label={`I confirm that all ${offer.installments} repayments will be automatically charged to my registered payment method above, beginning ${fmt(offer.startDate)}.`}
                  />

                  {error && (
                    <div className="flex items-start gap-2 text-destructive text-sm px-3 py-2.5">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span className="text-xs">{error}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setStep('repayments')}
                      className="flex-1 py-2.5 rounded-lg border border-border hover:bg-muted text-foreground font-medium text-sm transition-colors">
                      Back
                    </button>
                    <button onClick={activate} disabled={!okPayment}
                      className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      Activate Loan
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Activating ── */}
          {step === 'activating' && (
            <div className="py-10 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <Loader2 size={28} className="text-green-400 animate-spin" />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">Activating Loan…</p>
                <p className="text-xs text-muted-foreground mt-1">Generating your repayment schedule. Please wait.</p>
              </div>
            </div>
          )}

          {/* ── Success ── */}
          {step === 'success' && (
            <div className="py-10 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">Loan Activated!</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Your credit of <span className="font-semibold text-foreground">{kes(offer.principal)}</span> is now active.
                  Repayment installments have been scheduled — first payment on{' '}
                  <span className="font-semibold text-foreground">{fmt(offer.startDate)}</span>.
                </p>
              </div>
              <button onClick={() => { onActivated(); onClose(); }}
                className="px-8 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors">
                Done
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
