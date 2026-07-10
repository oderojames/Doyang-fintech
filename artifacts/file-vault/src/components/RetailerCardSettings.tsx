import { useState, useEffect } from 'react';
import {
  X, CreditCard, AlertTriangle, CheckCircle2, Loader2,
  TriangleAlert, ChevronLeft, RefreshCw,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

declare global {
  interface Window {
    PaystackPop: {
      setup(opts: {
        key: string; email: string; amount: number; currency: string;
        ref: string; channels: string[];
        onClose: () => void;
        callback: (response: { reference: string }) => void;
      }): { openIframe(): void };
    };
  }
}

interface Props {
  onClose: () => void;
  onConnected?: () => void;
}

type View = 'overview' | 'change';
type ConnectStatus = 'idle' | 'opening' | 'verifying' | 'success' | 'error';

export default function RetailerCardSettings({ onClose, onConnected }: Props) {
  const { user, paystackAuth, markCardConnected } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeLoansCount, setActiveLoansCount] = useState(0);
  const [checkError, setCheckError] = useState('');

  const [view, setView] = useState<View>('overview');
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>('idle');
  const [connectError, setConnectError] = useState('');
  const [newCard, setNewCard] = useState<{ last4: string; card_type: string; bank: string } | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setCheckError('');
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token || cancelled) return;
        const res = await fetch(`/api/loan-offers?retailerUid=${user!.uid}`, {
          headers: { 'X-Firebase-Token': token },
        });
        if (!res.ok) return;
        const json = await res.json() as { success: boolean; offers: { status: string }[] };
        if (json.success && !cancelled) {
          const active = json.offers.filter(o => o.status === 'active').length;
          setActiveLoansCount(active);
        }
      } catch {
        if (!cancelled) setCheckError('Could not load loan details. Check your connection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const handleConnect = () => {
    if (!user?.email) return;
    setConnectStatus('opening');
    setConnectError('');

    const run = () => {
      try {
        window.PaystackPop.setup({
          key: PUBLIC_KEY,
          email: user.email!,
          amount: 2000,
          currency: 'KES',
          ref: `card-${user.uid}-${Date.now()}`,
          channels: ['card'],
          onClose: () => setConnectStatus(s => s === 'opening' ? 'idle' : s),
          callback: (response) => {
            setConnectStatus('verifying');
            fetch('/api/paystack/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: response.reference }),
            })
              .then(r => { if (!r.ok) throw new Error('Verification failed'); return r.json() as Promise<{ authorization: Record<string, unknown> }>; })
              .then(async ({ authorization }) => {
                await updateDoc(doc(db, 'users', user!.uid), {
                  cardConnected: true,
                  cardOnboardingDone: true,
                  paystackAuth: authorization,
                });
                const card = {
                  last4: authorization.last4 as string,
                  card_type: authorization.card_type as string,
                  bank: authorization.bank as string,
                };
                markCardConnected(card);
                setNewCard(card);
                setConnectStatus('success');
                setView('overview');
                onConnected?.();
              })
              .catch((e: unknown) => {
                setConnectError(e instanceof Error ? e.message : 'Verification failed. Try again.');
                setConnectStatus('error');
              });
          },
        }).openIframe();
      } catch {
        setConnectStatus('error');
        setConnectError('Could not open Paystack. Please try again.');
      }
    };

    if (window.PaystackPop) { run(); return; }
    let s = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]') as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement('script');
      s.src = 'https://js.paystack.co/v1/inline.js';
      document.head.appendChild(s);
    }
    s.addEventListener('load', run, { once: true });
  };

  const currentCard = newCard ?? paystackAuth;
  const hasCard = !!(currentCard?.last4);

  const cardLabel = hasCard
    ? `${((currentCard!.card_type ?? 'Card').charAt(0).toUpperCase() + (currentCard!.card_type ?? 'Card').slice(1))} •••• ${currentCard!.last4}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="fixed inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.6)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.6)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3.5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5">
          {view === 'change' ? (
            <button
              onClick={() => { setView('overview'); setConnectStatus('idle'); setConnectError(''); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={17} />
            </button>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <CreditCard size={13} className="text-primary" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-foreground leading-none">
              {view === 'change' ? 'Change Payment Card' : 'Payment Card'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {view === 'change' ? 'Verify a new card via Paystack' : 'Card used for loan repayments'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-sm">Checking your loans…</span>
          </div>
        )}

        {/* Error */}
        {!loading && checkError && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{checkError}</span>
          </div>
        )}

        {/* ── Overview ── */}
        {!loading && !checkError && view === 'overview' && (
          <div className="space-y-4">

            {/* Current card card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Payment Card</p>
              </div>

              {hasCard ? (
                <div className="px-4 py-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                      <CreditCard size={15} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{cardLabel}</p>
                      {currentCard!.bank && (
                        <p className="text-xs text-muted-foreground mt-0.5">{currentCard!.bank}</p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-green-500/15 border border-green-500/30 text-green-400 shrink-0">
                      <CheckCircle2 size={9} /> Verified
                    </span>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6 text-center">
                  <CreditCard size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No payment card connected yet.</p>
                </div>
              )}
            </div>

            {/* Just updated — success banner */}
            {connectStatus === 'success' && newCard && (
              <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>Card updated successfully.</span>
              </div>
            )}

            {/* Active loans warning — blocks changing */}
            {activeLoansCount > 0 && (
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-4">
                <TriangleAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-300 leading-snug">
                    Cannot change card while loans are active
                  </p>
                  <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                    You have <span className="font-semibold">{activeLoansCount} active loan{activeLoansCount !== 1 ? 's' : ''}</span> in progress.
                    Changing your card now would break upcoming repayment charges.
                    Wait until all loans are fully repaid, then update your card here.
                  </p>
                </div>
              </div>
            )}

            {/* No active loans — allow change */}
            {activeLoansCount === 0 && connectStatus !== 'success' && (
              <button
                onClick={() => { setView('change'); setConnectStatus('idle'); setConnectError(''); }}
                className="w-full flex items-center justify-between gap-3 bg-card border border-border hover:border-primary/40 rounded-2xl px-4 py-3.5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <RefreshCw size={13} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">
                      {hasCard ? 'Change Payment Card' : 'Connect a Payment Card'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hasCard ? 'Replace the card used for repayments' : 'Add a card to enable loan repayments'}
                    </p>
                  </div>
                </div>
                <ChevronLeft size={14} className="text-muted-foreground rotate-180 shrink-0" />
              </button>
            )}

            <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed px-2">
              Your card is charged automatically on each repayment due date. Changing your card replaces the one currently on file.
            </p>
          </div>
        )}

        {/* ── Change view ── */}
        {!loading && !checkError && view === 'change' && (
          <div className="space-y-5">

            {/* Info card */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                  <CreditCard size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Verify a new card</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    A one-time KES 20 verification charge will be made and can be refunded on request.
                    Your card details go directly to Paystack — we never store raw card numbers.
                  </p>
                </div>
              </div>
            </div>

            {connectError && (
              <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                <AlertTriangle size={13} className="shrink-0" />
                <span>{connectError}</span>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={connectStatus === 'opening' || connectStatus === 'verifying'}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectStatus === 'opening' ? (
                <><Loader2 size={14} className="animate-spin" /> Opening Paystack…</>
              ) : connectStatus === 'verifying' ? (
                <><Loader2 size={14} className="animate-spin" /> Verifying card…</>
              ) : (
                <><CreditCard size={14} /> Connect Card via Paystack</>
              )}
            </button>

            <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
              Once verified, your new card will be used for all future repayments.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
