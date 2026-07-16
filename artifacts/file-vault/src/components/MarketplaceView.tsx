import { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag, AlertCircle, RefreshCw, Phone, CheckCircle2,
  X, Star, Package, LogOut, CreditCard, Settings, Calendar, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useLocation } from 'wouter';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import BuyerConnectCardBanner from '@/components/BuyerConnectCardBanner';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

function gradeColor(grade: string) {
  if (grade === 'A') return '#22c55e';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  if (grade === 'D') return '#ef4444';
  return '#7c3aed';
}

function fmt(n: number) {
  return `KES ${(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface MarketplaceProduct {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPhone?: string | null;
  sellerGrade: string;
  sellerScore: number;
  businessType: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  quantity: number;
  imageUrl: string | null;
  imageUrls?: string[] | null;
  status: string;
  createdAt: string;
  hpEnabled?: boolean;
  hpDeposit?: number;
  hpInstallments?: number;
  hpInstallmentAmount?: number;
  hpIntervalDays?: number;
}

function GradeBadge({ grade }: { grade: string }) {
  const color = gradeColor(grade);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
      style={{ background: color + '20', border: `1px solid ${color}50`, color }}
    >
      Trust Score {grade}
    </span>
  );
}

function ProductCard({ product, onClick }: { product: MarketplaceProduct; onClick: () => void }) {
  return (
    <div
      className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      {product.imageUrl ? (
        <div className="h-36 overflow-hidden bg-muted">
          <img
            src={product.imageUrl}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ) : (
        <div className="h-36 bg-muted/40 flex items-center justify-center">
          <Package size={36} className="text-muted-foreground/30" />
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{product.title}</p>
          {product.sellerGrade && product.sellerGrade !== '—' && (
            <GradeBadge grade={product.sellerGrade} />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{product.sellerName}</p>
        <div className="flex items-center justify-between pt-0.5">
          <p className="text-sm font-bold text-primary">{fmt(product.price)}</p>
          <p className="text-[10px] text-muted-foreground">{product.quantity} left</p>
        </div>
      </div>
    </div>
  );
}

function ProductDetailModal({
  product,
  onClose,
  onBuy,
  onHpBuy,
}: {
  product: MarketplaceProduct;
  onClose: () => void;
  onBuy: () => void;
  onHpBuy?: () => void;
}) {
  const color = gradeColor(product.sellerGrade);
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col">
      <div className="flex-1 flex flex-col w-full max-w-lg mx-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-sm font-bold text-foreground">Product Details</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {(() => {
          const imgs = (product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []);
          if (!imgs.length) return null;
          if (imgs.length === 1) {
            return (
              <div className="h-52 overflow-hidden bg-muted">
                <img
                  src={imgs[0]}
                  alt={product.title}
                  className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }}
                />
              </div>
            );
          }
          return (
            <div className="flex gap-1 overflow-x-auto snap-x snap-mandatory scrollbar-none bg-muted" style={{ height: '13rem' }}>
              {imgs.map((src, i) => (
                <div key={i} className="shrink-0 snap-start h-full" style={{ width: imgs.length === 2 ? '50%' : '75%' }}>
                  <img
                    src={src}
                    alt={`${product.title} ${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }}
                  />
                </div>
              ))}
            </div>
          );
        })()}

        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-foreground">{product.title}</h3>
            <p className="text-2xl font-bold text-primary mt-1">{fmt(product.price)}</p>
          </div>

          {(() => {
            const lines = product.description.split('\n').filter(Boolean);
            const pairs = lines.map(line => {
              const idx = line.indexOf(': ');
              return idx > 0
                ? { label: line.slice(0, idx), value: line.slice(idx + 2) }
                : { label: '', value: line };
            });
            const isStructured = pairs.some(p => p.label);
            if (isStructured) {
              return (
                <div className="bg-muted/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Product Details</span>
                  </div>
                  {pairs.map(({ label, value }, i) => (
                    <div key={i} className="flex items-start justify-between text-xs gap-3">
                      <span className="text-muted-foreground shrink-0">{label}</span>
                      <span className="font-medium text-foreground text-right">{value}</span>
                    </div>
                  ))}
                </div>
              );
            }
            return <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>;
          })()}

          <div className="bg-muted/40 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Star size={11} className="text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Seller Info</span>
            </div>
            {[
              { label: 'Seller', value: product.sellerName },
              ...(product.businessType ? [{ label: 'Business Type', value: product.businessType }] : []),
              { label: 'Available', value: `${product.quantity} unit${product.quantity !== 1 ? 's' : ''}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground">{value}</span>
              </div>
            ))}
            {product.sellerPhone ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Contact</span>
                <a
                  href={`tel:${product.sellerPhone}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {product.sellerPhone}
                </a>
              </div>
            ) : null}
            {product.sellerGrade && product.sellerGrade !== '—' && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Trust Grade</span>
                <GradeBadge grade={product.sellerGrade} />
              </div>
            )}
            {product.sellerScore > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Trust Score</span>
                <span className="font-bold" style={{ color }}>{product.sellerScore}/100</span>
              </div>
            )}
          </div>

          {product.hpEnabled && product.hpDeposit && product.hpInstallments && product.hpInstallmentAmount && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Hire Purchase Available</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Deposit now</span>
                  <span className="font-semibold text-foreground">{fmt(product.hpDeposit)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Then</span>
                  <span className="font-semibold text-foreground">{product.hpInstallments}× {fmt(product.hpInstallmentAmount)} every {product.hpIntervalDays ?? 30} days</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold text-foreground">{fmt(product.hpDeposit + product.hpInstallments * product.hpInstallmentAmount)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-1">
            <Button
              className="w-full font-semibold bg-green-500 hover:bg-green-400 text-white border-0 gap-2"
              onClick={onBuy}
              disabled={product.quantity < 1}
            >
              <ShoppingBag size={14} />
              {product.quantity < 1 ? 'Sold Out' : 'Buy Now via M-Pesa'}
            </Button>
            {product.hpEnabled && product.quantity >= 1 && onHpBuy && (
              <Button
                variant="outline"
                className="w-full font-semibold gap-2 border-primary/40 text-primary hover:bg-primary/5"
                onClick={onHpBuy}
              >
                <CreditCard size={14} />
                Buy via Hire Purchase
              </Button>
            )}
            <a
              href={`mailto:?subject=Enquiry about ${encodeURIComponent(product.title)}`}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border hover:bg-muted text-foreground font-medium py-2 px-4 transition-colors text-sm"
            >
              Contact Seller
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuyFlowModal({
  product,
  onClose,
  onSuccess,
  buyerEmail,
  buyerId,
}: {
  product: MarketplaceProduct;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
  buyerEmail: string;
  buyerId: string;
}) {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'initiating' | 'waiting' | 'success' | 'error'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(90);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const txRefRef = useRef<string | null>(null);

  const clearTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  useEffect(() => () => clearTimers(), []);

  const startPolling = (reference: string) => {
    txRefRef.current = reference;
    setCountdown(90);

    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearTimers();
          setStep('error');
          setError('Payment timed out. Please try again.');
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/payment/status/${encodeURIComponent(reference)}`);
        const data = await r.json() as { success: boolean; data?: { status: string } };
        if (!data.success) return;
        const status = data.data?.status;
        if (status === 'completed' || status === 'success') {
          clearTimers();
          const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
          const orderRes = await fetch('/api/orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              buyerEmail,
              buyerPhone: phone,
              productId: product.id,
              paystackRef: reference,
            }),
          });
          const orderData = await orderRes.json() as { success?: boolean; orderId?: string; error?: string };
          if (orderData.success && orderData.orderId) {
            setStep('success');
            onSuccess(orderData.orderId);
          } else {
            setStep('error');
            setError(orderData.error || 'Payment received but order creation failed. Contact support.');
          }
        } else if (status === 'failed' || status === 'abandoned') {
          clearTimers();
          setStep('error');
          setError('Payment was not completed. Please try again.');
        }
      } catch {
        // network blip — keep polling
      }
    }, 3000);
  };

  const initiate = async () => {
    const digits = phone.replace(/\D/g, '');
    const formatted = digits.startsWith('0') && digits.length === 10
      ? '+254' + digits.slice(1)
      : digits.startsWith('254') && digits.length === 12
      ? '+' + digits
      : digits.length === 9
      ? '+254' + digits
      : phone.trim();

    if (!formatted.startsWith('+254') || formatted.length !== 13) {
      setError('Please enter a valid Kenyan number (e.g. 0712 345 678)');
      return;
    }

    setError(null);
    setStep('initiating');
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
      const r = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phone: formatted,
          amount: product.price,
          email: buyerEmail || 'buyer@doyang.app',
          productId: product.id,
        }),
      });
      const data = await r.json() as { success: boolean; data?: { reference: string }; error?: string };
      if (!data.success || !data.data?.reference) {
        setStep('error');
        setError(data.error || 'Failed to initiate payment. Please try again.');
        return;
      }
      setStep('waiting');
      startPolling(data.data.reference);
    } catch {
      setStep('error');
      setError('Network error. Please check your connection and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center w-full max-w-sm mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <ShoppingBag size={14} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Buy via M-Pesa</p>
              <p className="text-[11px] text-muted-foreground">{fmt(product.price)}</p>
            </div>
          </div>
          {step !== 'waiting' && step !== 'initiating' && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {step === 'phone' && (
          <>
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Your M-Pesa number</p>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="e.g. 0712 345 678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && phone.trim()) initiate(); }}
                  className="pl-9 bg-background"
                  autoFocus
                />
              </div>
              {error && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
                  <AlertCircle size={12} className="shrink-0" />
                  {error}
                </div>
              )}
            </div>
            <Button
              className="w-full font-semibold bg-green-500 hover:bg-green-400 text-white border-0"
              onClick={initiate}
              disabled={!phone.trim()}
            >
              Pay {fmt(product.price)}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              You'll receive an M-Pesa prompt. Enter your PIN to complete.
            </p>
          </>
        )}

        {step === 'initiating' && (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
              <span className="w-5 h-5 border-2 border-green-500/30 border-t-green-400 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-foreground">Sending M-Pesa prompt…</p>
          </div>
        )}

        {step === 'waiting' && (
          <div className="space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
              <span className="w-6 h-6 border-2 border-green-500/30 border-t-green-400 rounded-full animate-spin" style={{ borderWidth: 3 }} />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Check your phone</p>
              <p className="text-xs text-muted-foreground mt-1">
                Enter your M-Pesa PIN to pay <span className="font-semibold text-foreground">{fmt(product.price)}</span>
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg px-3 py-2 inline-block">
              <p className="text-xs text-muted-foreground">
                Expires in{' '}
                <span className="font-mono font-semibold text-foreground">
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                </span>
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">We'll detect your payment automatically.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 size={26} className="text-green-400" />
            </div>
            <div>
              <p className="font-bold text-foreground">Payment Successful!</p>
              <p className="text-xs text-muted-foreground mt-1">Your order has been placed. The seller will be notified.</p>
            </div>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <AlertCircle size={15} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive leading-snug">{error || 'Something went wrong.'}</p>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => { setStep('phone'); setError(null); }}
            >
              <RefreshCw size={13} /> Try Again
            </Button>
            <button
              onClick={onClose}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface HpRepayment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: 'upcoming' | 'due' | 'paid' | 'failed';
  paidAt: string | null;
}

interface HpOrder {
  id: string;
  buyerId: string;
  sellerId: string;
  productTitle: string;
  depositAmount: number;
  installments: number;
  installmentAmount: number;
  intervalDays: number;
  installmentsPaid: number;
  status: 'active' | 'completed' | 'defaulted';
  createdAt: string;
  repayments: HpRepayment[];
}

function BuyerSettingsPanel({ onClose }: { onClose: () => void }) {
  const { user, buyerCardConnected } = useAuth();
  const [tab, setTab] = useState<'card' | 'hp'>('card');
  const [cardInfo, setCardInfo] = useState<{ last4: string; card_type: string; bank: string } | null>(null);
  const [loadingCard, setLoadingCard] = useState(true);
  const [hpOrders, setHpOrders] = useState<HpOrder[]>([]);
  const [loadingHp, setLoadingHp] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user?.uid) { setLoadingCard(false); return; }
    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        const d = snap.data();
        if (d?.buyerCardConnected && d?.buyerPaystackAuth) {
          setCardInfo({
            last4: d.buyerPaystackAuth.last4 || '****',
            card_type: d.buyerPaystackAuth.card_type || '',
            bank: d.buyerPaystackAuth.bank || '',
          });
        }
        setLoadingCard(false);
      })
      .catch(() => setLoadingCard(false));
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) { setLoadingHp(false); return; }
    auth.currentUser?.getIdToken().catch(() => null).then(token => {
      fetch('/api/hp/orders', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(r => r.json() as Promise<{ success?: boolean; orders?: HpOrder[] }>)
        .then(data => { if (data.success) setHpOrders((data.orders ?? []).filter(o => o.buyerId === user?.uid)); })
        .catch(() => {})
        .finally(() => setLoadingHp(false));
    });
  }, [user?.uid]);

  const activeHp = hpOrders.filter(o => o.status === 'active');

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
      const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) hdrs.Authorization = `Bearer ${token}`;
      const r = await fetch('/api/hp/disconnect-card', { method: 'POST', headers: hdrs });
      const data = await r.json() as { success?: boolean; error?: string };
      if (data.success) { window.location.reload(); }
      else { setDisconnectError(data.error || 'Could not remove card.'); }
    } catch { setDisconnectError('Network error. Please try again.'); }
    setDisconnecting(false);
  };

  const openPaystack = () => {
    if (!user?.email) return;
    setAdding(true);
    const run = () => {
      try {
        window.PaystackPop.setup({
          key: PUBLIC_KEY,
          email: user.email!,
          amount: 2000,
          currency: 'KES',
          ref: `buyer-card-${user.uid}-${Date.now()}`,
          channels: ['card'],
          onClose: () => setAdding(false),
          callback: (resp: { reference: string }) => {
            fetch('/api/paystack/verify-and-refund', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: resp.reference }),
            })
              .then(r2 => r2.json() as Promise<{ authorization: Record<string, unknown> }>)
              .then(({ authorization }) => {
                if (!user?.uid) return;
                updateDoc(doc(db, 'users', user.uid), {
                  buyerCardConnected: true,
                  buyerPaystackAuth: authorization,
                }).catch(() => {});
                window.location.reload();
              })
              .catch(() => setAdding(false));
          },
        }).openIframe();
      } catch { setAdding(false); }
    };
    if (window.PaystackPop) { run(); return; }
    let s = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]') as HTMLScriptElement | null;
    if (!s) { s = document.createElement('script'); s.src = 'https://js.paystack.co/v1/inline.js'; document.head.appendChild(s); }
    s.addEventListener('load', run, { once: true });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Settings size={13} className="text-primary" />
          </div>
          <h2 className="text-sm font-bold text-foreground">Settings</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
      </div>

      <div className="flex border-b border-border shrink-0">
        {(['card', 'hp'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 -mb-px ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'card'
              ? <><CreditCard size={12} /> Payment Card</>
              : <><Calendar size={12} /> Hire Purchase {activeHp.length > 0 && <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{activeHp.length}</span>}</>
            }
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-lg mx-auto w-full">
        {tab === 'card' && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payment Card</p>
            {loadingCard ? (
              <div className="flex items-center justify-center py-6">
                <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : buyerCardConnected && cardInfo ? (
              <>
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <CreditCard size={15} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">···· {cardInfo.last4}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[cardInfo.card_type?.toUpperCase(), cardInfo.bank].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-semibold shrink-0">Active</span>
                </div>
                {activeHp.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 text-[11px] text-amber-400 leading-relaxed">
                    You have {activeHp.length} active hire purchase plan{activeHp.length !== 1 ? 's' : ''}. Your card cannot be changed or removed until all plans are complete.
                  </div>
                )}
                {disconnectError && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle size={11} className="shrink-0" /> {disconnectError}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={openPaystack} disabled={adding || activeHp.length > 0}>
                    {adding ? <><span className="w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />Opening…</> : <><CreditCard size={11} />Change Card</>}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60" onClick={handleDisconnect} disabled={disconnecting || activeHp.length > 0}>
                    {disconnecting ? <><span className="w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />Removing…</> : 'Remove Card'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center py-6 space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                    <CreditCard size={20} className="text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No card saved</p>
                  <p className="text-xs text-muted-foreground">Add a card to enable hire purchase buying.</p>
                </div>
                <Button className="w-full gap-2 text-xs" onClick={openPaystack} disabled={adding}>
                  {adding ? <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />Opening…</> : <><CreditCard size={12} />Add Card</>}
                </Button>
              </>
            )}
          </div>
        )}

        {tab === 'hp' && (
          loadingHp ? (
            <div className="flex items-center justify-center py-14">
              <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : hpOrders.length === 0 ? (
            <div className="text-center py-14 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                <Calendar size={24} className="text-muted-foreground/30" />
              </div>
              <p className="text-sm font-semibold text-foreground">No hire purchase orders</p>
              <p className="text-xs text-muted-foreground">Products you buy on HP will appear here with the full schedule.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {hpOrders.map(order => {
                const paid = order.repayments.filter(r => r.status === 'paid').length;
                const remaining = order.installments - paid;
                const nextDue = order.repayments.find(r => r.status === 'due' || r.status === 'upcoming');
                return (
                  <div key={order.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-foreground leading-snug">{order.productTitle}</p>
                      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${order.status === 'active' ? 'bg-primary/15 text-primary' : order.status === 'completed' ? 'bg-green-500/15 text-green-400' : 'bg-destructive/15 text-destructive'}`}>
                        {order.status === 'active' ? 'Active' : order.status === 'completed' ? 'Completed' : 'Defaulted'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-muted/40 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Deposit</p>
                        <p className="text-[11px] font-bold text-foreground mt-0.5">{fmt(order.depositAmount)}</p>
                      </div>
                      <div className="bg-muted/40 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Paid</p>
                        <p className="text-[11px] font-bold text-green-400 mt-0.5">{paid}/{order.installments}</p>
                      </div>
                      <div className="bg-muted/40 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Remaining</p>
                        <p className="text-[11px] font-bold text-foreground mt-0.5">{remaining > 0 ? remaining : '—'}</p>
                      </div>
                    </div>

                    {order.repayments.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          {order.repayments.map(r => (
                            <div key={r.installmentNumber} title={`Installment ${r.installmentNumber}: ${r.status}`}
                              className={`flex-1 h-1.5 rounded-full ${r.status === 'paid' ? 'bg-green-500' : r.status === 'failed' ? 'bg-destructive' : r.status === 'due' ? 'bg-amber-400' : 'bg-muted'}`}
                            />
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {order.status === 'completed' ? '✓ All installments paid' :
                           order.status === 'defaulted' ? 'Plan defaulted — contact support' :
                           nextDue ? `Next: ${fmt(nextDue.amount)} due ${new Date(nextDue.dueDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}` :
                           'All installments scheduled'}
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5 pt-2 border-t border-border">
                      {order.repayments.map(r => (
                        <div key={r.installmentNumber} className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${r.status === 'paid' ? 'bg-green-500/20 text-green-400' : r.status === 'failed' ? 'bg-destructive/20 text-destructive' : r.status === 'due' ? 'bg-amber-400/20 text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                              {r.status === 'paid' ? '✓' : r.installmentNumber}
                            </span>
                            <span className="text-muted-foreground">Installment {r.installmentNumber}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-foreground">{fmt(r.amount)}</span>
                            <span className="text-muted-foreground ml-1.5 text-[10px]">
                              {r.status === 'paid' && r.paidAt
                                ? `Paid ${new Date(r.paidAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}`
                                : new Date(r.dueDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function HpBuyFlowModal({
  product,
  onClose,
  onSuccess,
  buyerEmail,
}: {
  product: MarketplaceProduct;
  onClose: () => void;
  onSuccess: () => void;
  buyerEmail: string;
}) {
  type Step = 'terms' | 'phone' | 'initiating' | 'waiting' | 'confirming' | 'success' | 'error';
  const [step, setStep] = useState<Step>('terms');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [countdown, setCountdown] = useState(90);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const depositAmount = Number(product.hpDeposit ?? 0);
  const installments = Number(product.hpInstallments ?? 0);
  const installmentAmount = Number(product.hpInstallmentAmount ?? 0);
  const intervalDays = Number(product.hpIntervalDays ?? 30);
  const total = depositAmount + installments * installmentAmount;

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  useEffect(() => () => clearTimers(), []);

  const initiateDeposit = async () => {
    setStep('initiating');
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
      const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) hdrs['Authorization'] = `Bearer ${token}`;

      const r = await fetch('/api/hp/initiate-deposit', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ productId: product.id, phone, email: buyerEmail }),
      });
      const data = await r.json() as { success?: boolean; error?: string; data?: { reference: string } };
      if (!data.success || !data.data?.reference) {
        setError(data.error || 'Could not initiate payment. Please try again.');
        setStep('error');
        return;
      }

      const ref = data.data.reference;
      setReference(ref);
      setStep('waiting');
      setCountdown(90);

      timerRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearTimers();
            setError('Payment timed out. Please try again.');
            setStep('error');
            return 0;
          }
          return c - 1;
        });
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          const r2 = await fetch(`/api/hp/deposit-status/${ref}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const d2 = await r2.json() as { success?: boolean; data?: { status: string } };
          const status = d2.data?.status;
          if (status === 'completed') {
            clearTimers();
            setStep('confirming');
            const r3 = await fetch('/api/hp/confirm', {
              method: 'POST',
              headers: hdrs,
              body: JSON.stringify({ productId: product.id, depositRef: ref }),
            });
            const d3 = await r3.json() as { success?: boolean; error?: string };
            if (d3.success) {
              setStep('success');
            } else {
              setError(d3.error || 'Order creation failed. Please contact support.');
              setStep('error');
            }
          } else if (status === 'failed') {
            clearTimers();
            setError('M-Pesa payment was declined. Please try again.');
            setStep('error');
          }
        } catch { /* retry silently */ }
      }, 3000);
    } catch {
      setError('Network error. Please try again.');
      setStep('error');
    }
  };

  const busy = step === 'waiting' || step === 'initiating' || step === 'confirming';

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <CreditCard size={14} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Hire Purchase</p>
              <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{product.title}</p>
            </div>
          </div>
          {!busy && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {step === 'terms' && (
          <>
            <div className="bg-muted/40 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-semibold text-foreground mb-1">Payment Plan</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Deposit (M-Pesa, now)</span>
                <span className="font-semibold text-foreground">{fmt(depositAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Installments</span>
                <span className="font-semibold text-foreground">{installments} × {fmt(installmentAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Frequency</span>
                <span className="font-semibold text-foreground">Every {intervalDays} days</span>
              </div>
              <div className="pt-1.5 border-t border-border flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Total</span>
                <span className="font-bold text-foreground">{fmt(total)}</span>
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 text-[11px] text-amber-400 leading-relaxed">
              Your saved card will be charged automatically on each due date. Ensure it has sufficient funds.
            </div>
            <Button className="w-full font-semibold gap-2" onClick={() => setStep('phone')}>
              <CreditCard size={14} />
              Proceed — Pay Deposit
            </Button>
            <button onClick={onClose} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              Cancel
            </button>
          </>
        )}

        {step === 'phone' && (
          <>
            <div>
              <p className="text-xs font-medium text-foreground mb-1.5">
                Pay <span className="font-bold text-primary">{fmt(depositAmount)}</span> deposit via M-Pesa
              </p>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="e.g. 0712 345 678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && phone.trim()) initiateDeposit(); }}
                  className="pl-9 bg-background"
                  autoFocus
                />
              </div>
              {error && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
                  <AlertCircle size={12} className="shrink-0" />{error}
                </div>
              )}
            </div>
            <Button
              className="w-full font-semibold bg-green-500 hover:bg-green-400 text-white border-0"
              onClick={initiateDeposit}
              disabled={!phone.trim()}
            >
              Pay Deposit {fmt(depositAmount)}
            </Button>
            <button onClick={() => setStep('terms')} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              ← Back
            </button>
          </>
        )}

        {step === 'initiating' && (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-foreground">Sending M-Pesa prompt…</p>
          </div>
        )}

        {step === 'waiting' && (
          <div className="space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <span className="w-6 h-6 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Check your phone</p>
              <p className="text-xs text-muted-foreground mt-1">
                Enter your PIN to pay <span className="font-semibold text-foreground">{fmt(depositAmount)}</span> deposit
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg px-3 py-2 inline-block">
              <p className="text-xs text-muted-foreground">
                Expires in{' '}
                <span className="font-mono font-semibold text-foreground">
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                </span>
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">We'll detect your payment automatically.</p>
          </div>
        )}

        {step === 'confirming' && (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-foreground">Setting up your hire purchase…</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 size={26} className="text-green-400" />
            </div>
            <div>
              <p className="font-bold text-foreground">Hire Purchase Confirmed!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deposit paid. Your card will be charged{' '}
                <span className="font-semibold text-foreground">{installments}×{fmt(installmentAmount)}</span>{' '}
                every {intervalDays} days.
              </p>
            </div>
            <Button className="w-full bg-green-500 hover:bg-green-400 text-white border-0" onClick={onSuccess}>
              Done
            </Button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <AlertCircle size={15} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive leading-snug">{error || 'Something went wrong.'}</p>
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={() => { setStep('phone'); setError(null); }}>
              <RefreshCw size={13} /> Try Again
            </Button>
            <button onClick={onClose} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketplaceView() {
  const { user, signOut } = useAuth();
  const { addLocalNotification } = useNotifications();
  const [, navigate] = useLocation();
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<MarketplaceProduct | null>(null);
  const [buying, setBuying] = useState<MarketplaceProduct | null>(null);
  const [hpBuying, setHpBuying] = useState<MarketplaceProduct | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      if (cancelled) return;
      if (!hasLoadedOnce.current) setLoading(true);
      setFetchError(null);
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
        const r = await fetch('/api/products', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json() as { products?: MarketplaceProduct[] };
        if (!cancelled) {
          setProducts(
            (data.products ?? [])
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 50)
          );
          setLoading(false);
          hasLoadedOnce.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[marketplace] fetch error:', err);
          setFetchError('Failed to load products. Please check your connection.');
          setLoading(false);
          hasLoadedOnce.current = true;
        }
      }
    }

    fetchProducts();
    // Poll every 30 s so quantity updates (stock decrements) stay fresh
    const interval = setInterval(fetchProducts, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [retryKey]);

  // Refresh listing after a successful purchase so the buyer sees the updated stock
  const refreshProducts = () => setRetryKey(k => k + 1);

  const handleOrderSuccess = (orderId: string) => {
    addLocalNotification({
      id: `order-${orderId}`,
      type: 'new_order',
      title: 'Order placed!',
      body: `Your purchase was successful. The seller has been notified.`,
    });
    setBuying(null);
    setSelected(null);
    refreshProducts(); // re-poll so updated stock is visible immediately
  };

  const categories = Array.from(new Set(products.map(p => p.businessType).filter(Boolean))).sort();

  const filteredProducts = products.filter(p => {
    const matchesSearch = searchQuery.trim() === ''
      || p.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.businessType === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Marketplace</h1>
            <p className="text-[11px] text-muted-foreground">
              {user?.displayName || user?.email?.split('@')[0] || 'Buyer'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <BuyerConnectCardBanner />

      <div className="flex-1 px-4 pb-8">
        {!loading && !fetchError && products.length > 0 && (
          <div className="mb-4 space-y-2.5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 bg-card"
              />
            </div>
            {categories.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${categoryFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40'}`}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors whitespace-nowrap ${categoryFilter === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/40'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading listings…</p>
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle size={16} /> {fetchError}
            </div>
            <Button variant="outline" size="sm" onClick={() => setRetryKey(k => k + 1)} className="gap-2">
              <RefreshCw size={13} /> Retry
            </Button>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Package size={32} className="text-green-400/50" />
            </div>
            <p className="text-sm font-semibold text-foreground">No listings yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Verified sellers haven't posted any products yet. Check back soon.
            </p>
            <Button variant="outline" size="sm" onClick={() => setRetryKey(k => k + 1)} className="gap-2 mt-1">
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Search size={28} className="text-muted-foreground/40" />
            </div>
            <p className="text-sm font-semibold text-foreground">No matching products</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Try a different search term or category.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearchQuery(''); setCategoryFilter('all'); }}
              className="gap-2 mt-1"
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filteredProducts.map(p => (
              <ProductCard key={p.id} product={p} onClick={() => setSelected(p)} />
            ))}
          </div>
        )}
      </div>

      {selected && !buying && !hpBuying && (
        <ProductDetailModal
          product={selected}
          onClose={() => setSelected(null)}
          onBuy={() => { setBuying(selected); }}
          onHpBuy={() => { setHpBuying(selected); }}
        />
      )}

      {buying && (
        <BuyFlowModal
          product={buying}
          onClose={() => setBuying(null)}
          onSuccess={handleOrderSuccess}
          buyerEmail={user?.email || ''}
          buyerId={user?.uid || ''}
        />
      )}

      {hpBuying && (
        <HpBuyFlowModal
          product={hpBuying}
          onClose={() => setHpBuying(null)}
          onSuccess={() => {
            addLocalNotification({
              id: `hp-${Date.now()}`,
              type: 'new_order',
              title: 'Hire purchase confirmed!',
              body: `Deposit paid for ${hpBuying.title}. Installments will be charged to your card automatically.`,
            });
            setHpBuying(null);
            setSelected(null);
            refreshProducts();
          }}
          buyerEmail={user?.email || ''}
        />
      )}

      {showSettings && (
        <BuyerSettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
