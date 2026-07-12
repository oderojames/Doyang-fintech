import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CreditCard, X, CheckCircle2, XCircle, Loader2, Banknote, Zap, RefreshCw, ChevronDown, Store, Upload, ShoppingBag } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { OfferCard, type LoanOffer } from './LoanOffersSection';
import type { CardInfo } from './LoanAcceptanceModal';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

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

interface CardFlowState {
  status: 'idle' | 'opening' | 'verifying' | 'success' | 'error';
  errorMsg: string;
}

async function getToken(): Promise<string | null> {
  try { return await auth.currentUser?.getIdToken() ?? null; } catch { return null; }
}

export default function NotificationCenter({
  onContinueToSellerMode,
  onSellerUpload,
}: {
  onContinueToSellerMode?: () => void;
  onSellerUpload?: () => void;
}) {
  const { user, markCardConnected, paystackAuth } = useAuth();
  const { notifications, unreadCount, removeNotification } = useNotifications();
  const [open, setOpen] = useState(false);
  const [cardFlow, setCardFlow] = useState<CardFlowState>({ status: 'idle', errorMsg: '' });
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // ── Loan offers state ───────────────────────────────────────────────────────
  const [offers, setOffers] = useState<LoanOffer[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const cardInfo: CardInfo | null = paystackAuth?.last4
    ? { last4: paystackAuth.last4, card_type: paystackAuth.card_type, bank: paystackAuth.bank }
    : null;

  // Track which offer IDs we have already attempted to repair so we don't spam
  // the endpoint. A Set stored in a ref persists across renders but resets when
  // the component unmounts (i.e. on logout), which is exactly what we want.
  const repairedOffers = useRef<Set<string>>(new Set());

  const fetchOffers = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/loan-offers?retailerUid=${user.uid}`, {
        headers: { 'X-Firebase-Token': token },
      });
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; offers: LoanOffer[] };
      if (json.success) {
        const sorted = json.offers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setOffers(sorted);

        // For every active loan that has no split yet, silently call repair-split.
        // The endpoint is idempotent — it skips if the split already exists.
        const needsRepair = sorted.filter(
          o => (o.status === 'active' || o.status === 'accepted') &&
               !o.splitCode &&
               !repairedOffers.current.has(o.id)
        );
        if (needsRepair.length > 0) {
          getToken().then(t => {
            if (!t) return;
            for (const offer of needsRepair) {
              repairedOffers.current.add(offer.id);
              fetch(`/api/loan-offers/${offer.id}/repair-split`, {
                method: 'POST',
                headers: { 'X-Firebase-Token': t },
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      }
    } catch { /* silent */ }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    fetchOffers();
    const id = setInterval(fetchOffers, 15_000);
    const onFocus = () => fetchOffers();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [user?.uid, fetchOffers]);

  const handleOfferUpdate = (id: string, status: 'active' | 'declined') => {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const pending = offers.filter(o => o.status === 'pending_retailer_acceptance');
  const active  = offers.filter(o => o.status === 'active' || o.status === 'accepted');
  const history = offers.filter(o => o.status === 'declined' || o.status === 'cancelled');

  // ── Panel close on outside click ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Card connect flow ───────────────────────────────────────────────────────
  const verifyAndSave = (reference: string) => {
    setCardFlow({ status: 'verifying', errorMsg: '' });
    fetch('/api/paystack/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Verification failed');
        return r.json() as Promise<{ authorization: Record<string, unknown> }>;
      })
      .then(({ authorization }) => {
        if (!user?.uid) return;
        updateDoc(doc(db, 'users', user.uid), {
          cardConnected: true,
          cardOnboardingDone: true,
          paystackAuth: authorization,
        }).catch(() => {});
        markCardConnected({
          last4: authorization.last4 as string | undefined,
          card_type: authorization.card_type as string | undefined,
          bank: authorization.bank as string | undefined,
        });
        setCardFlow({ status: 'success', errorMsg: '' });
        setTimeout(() => {
          removeNotification('card-required');
          setCardFlow({ status: 'idle', errorMsg: '' });
          setOpen(false);
        }, 1800);
      })
      .catch((e: unknown) => {
        setCardFlow({
          status: 'error',
          errorMsg: e instanceof Error ? e.message : 'Verification failed. Please try again.',
        });
      });
  };

  const handleConnectCard = () => {
    if (!user?.email) return;
    setCardFlow({ status: 'opening', errorMsg: '' });

    const runPaystack = () => {
      try {
        const ref = `card-${user.uid}-${Date.now()}`;
        const handler = window.PaystackPop.setup({
          key: PUBLIC_KEY,
          email: user.email!,
          amount: 2000,
          currency: 'KES',
          ref,
          channels: ['card'],
          onClose: () => {
            setCardFlow((s) =>
              s.status === 'opening' ? { status: 'idle', errorMsg: '' } : s
            );
          },
          callback: (response) => {
            verifyAndSave(response.reference);
          },
        });
        handler.openIframe();
      } catch {
        setCardFlow({ status: 'error', errorMsg: 'Could not open payment. Please try again.' });
      }
    };

    if (window.PaystackPop) { runPaystack(); return; }

    let s = document.querySelector(
      'script[src="https://js.paystack.co/v1/inline.js"]'
    ) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement('script');
      s.src = 'https://js.paystack.co/v1/inline.js';
      document.head.appendChild(s);
    }
    s.addEventListener('load', runPaystack, { once: true });
  };

  // Badge = unread notifications + pending loan offers
  const totalBadge = unreadCount + pending.length;
  const hasOffers = pending.length > 0 || active.length > 0 || history.length > 0;

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label={totalBadge > 0 ? `${totalBadge} unread` : 'Notifications'}
      >
        <Bell size={18} className={totalBadge > 0 ? 'text-amber-400' : ''} />
        {totalBadge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-bold text-white flex items-center justify-center leading-none">
            {totalBadge > 9 ? '9+' : totalBadge}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed inset-0 z-[200] bg-background flex flex-col"
        >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-muted-foreground" />
                <span className="text-sm font-semibold">Notifications</span>
                {totalBadge > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold">
                    {totalBadge}
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* System notifications */}
              {notifications.length === 0 && !hasOffers ? (
                <div className="px-4 py-10 text-center">
                  <Bell size={28} className="mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground mt-1">You're all caught up!</p>
                </div>
              ) : (
                <>
                  {notifications.map((notif) => (
                    <div key={notif.id} className="p-4 border-b border-border last:border-0">
                      {notif.type === 'card_required' && (
                        <CardRequiredNotification
                          notif={notif}
                          cardFlow={cardFlow}
                          onConnect={handleConnectCard}
                          onRetry={() => setCardFlow({ status: 'idle', errorMsg: '' })}
                        />
                      )}
                      {notif.type === 'seller_verification' && (
                        <SellerVerificationNotification
                          notif={notif}
                          onContinue={() => { removeNotification(notif.id); setOpen(false); onContinueToSellerMode?.(); }}
                          onUpload={() => { removeNotification(notif.id); setOpen(false); onSellerUpload?.(); }}
                          onDismiss={() => removeNotification(notif.id)}
                        />
                      )}
                      {notif.type === 'new_order' && (
                        <NewOrderNotification
                          notif={notif}
                          onDismiss={() => removeNotification(notif.id)}
                        />
                      )}
                      {!['card_required', 'seller_verification', 'new_order'].includes(notif.type) && (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{notif.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{notif.body}</p>
                          </div>
                          <button
                            onClick={() => removeNotification(notif.id)}
                            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Credit Offers section */}
                  {hasOffers && (
                    <div className={notifications.length > 0 ? 'border-t border-border' : ''}>

                      {/* Sub-header */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border/60">
                        <Banknote size={12} className="text-amber-400" />
                        <span className="text-xs font-semibold text-foreground">Credit Offers</span>
                        {pending.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold">
                            {pending.length}
                          </span>
                        )}
                        {active.length > 0 && (
                          <span className="text-[10px] text-green-400 font-medium">
                            · {active.length} active
                          </span>
                        )}
                        <button
                          onClick={() => fetchOffers()}
                          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                          title="Refresh"
                        >
                          <RefreshCw size={11} />
                        </button>
                      </div>

                      <div className="px-3 py-3 space-y-3">
                        {/* Pending */}
                        {pending.map(o => (
                          <OfferCard key={o.id} offer={o} cardInfo={cardInfo} onUpdate={handleOfferUpdate} />
                        ))}

                        {/* Active */}
                        {active.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-[10px] font-semibold text-green-400 flex items-center gap-1">
                              <Zap size={9} /> Active Loans ({active.length})
                            </p>
                            {active.map(o => (
                              <OfferCard key={o.id} offer={o} cardInfo={cardInfo} onUpdate={handleOfferUpdate} />
                            ))}
                          </div>
                        )}

                        {/* History toggle */}
                        {history.length > 0 && (
                          <div>
                            <button
                              onClick={() => setShowHistory(s => !s)}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ChevronDown size={12} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                              {showHistory ? 'Hide' : 'Show'} declined ({history.length})
                            </button>
                            {showHistory && (
                              <div className="mt-2 space-y-2">
                                {history.map(o => (
                                  <OfferCard key={o.id} offer={o} cardInfo={cardInfo} onUpdate={handleOfferUpdate} />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
        </div>
      )}
    </div>
  );
}

function NewOrderNotification({
  notif,
  onDismiss,
}: {
  notif: { title: string; body: string };
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-green-500/15 border border-green-500/30">
          <ShoppingBag size={16} className="text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{notif.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{notif.body}</p>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function SellerVerificationNotification({
  notif,
  onContinue,
  onUpload,
  onDismiss,
}: {
  notif: { title: string; body: string; sellerVerified?: boolean };
  onContinue: () => void;
  onUpload: () => void;
  onDismiss: () => void;
}) {
  const success = notif.sellerVerified === true;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${success ? 'bg-green-500/15 border border-green-500/30' : 'bg-red-500/15 border border-red-500/30'}`}>
          {success
            ? <CheckCircle2 size={16} className="text-green-400" />
            : <XCircle size={16} className="text-red-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{notif.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{notif.body}</p>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
          <X size={13} />
        </button>
      </div>
      {success ? (
        <button
          onClick={onContinue}
          className="w-full h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Store size={12} /> Continue to Seller Mode
        </button>
      ) : (
        <button
          onClick={onUpload}
          className="w-full h-9 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Upload size={12} /> Upload Another Statement
        </button>
      )}
    </div>
  );
}

function CardRequiredNotification({
  notif,
  cardFlow,
  onConnect,
  onRetry,
}: {
  notif: { title: string; body: string };
  cardFlow: CardFlowState;
  onConnect: () => void;
  onRetry: () => void;
}) {
  if (cardFlow.status === 'success') {
    return (
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0">
          <CheckCircle2 size={18} className="text-green-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-green-400">Card connected!</p>
          <p className="text-xs text-muted-foreground">Automatic repayments are now enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
          <CreditCard size={16} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{notif.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{notif.body}</p>
        </div>
      </div>

      {cardFlow.status === 'error' && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          <X size={12} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{cardFlow.errorMsg}</p>
        </div>
      )}

      <button
        onClick={cardFlow.status === 'error' ? onRetry : onConnect}
        disabled={cardFlow.status === 'opening' || cardFlow.status === 'verifying'}
        className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {cardFlow.status === 'opening' ? (
          <><Loader2 size={12} className="animate-spin" /> Opening…</>
        ) : cardFlow.status === 'verifying' ? (
          <><Loader2 size={12} className="animate-spin" /> Verifying…</>
        ) : cardFlow.status === 'error' ? (
          <>Try again</>
        ) : (
          <><CreditCard size={12} /> Tap here to connect your card</>
        )}
      </button>
    </div>
  );
}
