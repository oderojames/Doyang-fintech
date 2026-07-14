import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import WholesalerAuthPage from '@/pages/WholesalerAuthPage';
import CompleteProfileScreen from '@/components/CompleteProfileScreen';
import { Building2, LogOut, Users, RefreshCw, AlertCircle, Search, Copy, Check, Trash2, Lock, Calendar, Mail, CheckCircle2, Smartphone, CreditCard, ChevronRight, X, Filter, Briefcase, Banknote, Phone, Settings } from 'lucide-react';
import NotificationCenter from '@/components/NotificationCenter';
import WholesalerSettlementOnboarding from '@/components/WholesalerSettlementOnboarding';
import WholesalerSettlementBanner from '@/components/WholesalerSettlementBanner';
import WholesalerSettlementSettings from '@/components/WholesalerSettlementSettings';
import LoanOfferModal, { type LoanOfferTarget } from '@/components/LoanOfferModal';
import WholesalerLoansTab from '@/components/WholesalerLoansTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collection, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

function EmailVerificationBanner() {
  const { user, signOut, sendVerificationEmail, reloadUser } = useAuth();
  const [, navigate] = useLocation();
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'not-yet'>('idle');

  // Auto-verify when the user lands back on the app after clicking the link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') !== '1') return;
    const clean = new URL(window.location.href);
    clean.searchParams.delete('verified');
    window.history.replaceState({}, '', clean.toString());
    setCheckStatus('checking');
    reloadUser().then((ok) => {
      if (!ok) { setCheckStatus('not-yet'); setTimeout(() => setCheckStatus('idle'), 3000); }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResend = async () => {
    setResendStatus('sending');
    try { await sendVerificationEmail(); setResendStatus('sent'); setTimeout(() => setResendStatus('idle'), 4000); }
    catch { setResendStatus('idle'); }
  };

  const handleContinue = async () => {
    setCheckStatus('checking');
    const ok = await reloadUser();
    if (!ok) { setCheckStatus('not-yet'); setTimeout(() => setCheckStatus('idle'), 3000); }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 mx-auto">
            <Mail size={30} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Verify your email</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We sent a verification link to <span className="font-semibold text-foreground">{user?.email}</span>.
              <br />Open it to activate your account, then click <em>Continue</em>.
            </p>
          </div>
          <div className="space-y-2 pt-1">
            <button onClick={handleContinue} disabled={checkStatus === 'checking'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2.5 px-4 transition-colors text-sm disabled:opacity-60">
              {checkStatus === 'checking'
                ? <><RefreshCw size={14} className="animate-spin" /> Checking…</>
                : <><CheckCircle2 size={14} /> I've verified — Continue</>}
            </button>
            {checkStatus === 'not-yet' && (
              <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 justify-center">
                <AlertCircle size={13} />
                Email not verified yet. Please click the link in your inbox first.
              </div>
            )}
            <button onClick={handleResend} disabled={resendStatus !== 'idle'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted text-foreground font-medium py-2.5 px-4 transition-colors text-sm disabled:opacity-60">
              {resendStatus === 'sending' ? 'Sending…' : resendStatus === 'sent' ? '✓ Email resent!' : 'Resend verification email'}
            </button>
            <button onClick={async () => { await signOut(); navigate('/'); }}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReportSummary {
  id: string;
  retailerUid?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  retailerName: string;
  retailerEmail: string;
  fileName: string;
  dateAdded: string;
  score: number;
  grade: string;
  label: string;
  creditLimit?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  visibility?: 'public' | 'private' | 'sameBusiness';
  allowedWholesalers?: string[];
  businessType?: string;
}

function scoreStyle(score: number) {
  if (score >= 85) return { text: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/30', bar: '#22c55e' };
  if (score >= 70) return { text: 'text-blue-400',  bg: 'bg-blue-500/15',  border: 'border-blue-500/30',  bar: '#3b82f6' };
  if (score >= 55) return { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', bar: '#f59e0b' };
  if (score >= 40) return { text: 'text-orange-400',bg: 'bg-orange-500/15',border: 'border-orange-500/30',bar: '#f97316' };
  return              { text: 'text-red-400',   bg: 'bg-red-500/15',   border: 'border-red-500/30',   bar: '#ef4444' };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPeriod(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

const FREE_QUOTA = 3;
const PAYMENT_TIERS = [
  { slots: 10,  amount: 100, label: '10 more retailers',  badge: 'Popular' },
  { slots: 20,  amount: 200, label: '20 more retailers',  badge: '' },
  { slots: 30,  amount: 300, label: '30 more retailers',  badge: '' },
  { slots: 50,  amount: 500, label: '50+ more retailers', badge: 'Best Value' },
];

function RetailersManagedTab({ wholesalerUid }: { wholesalerUid: string }) {
  const [reports, setReports]     = useState<ReportSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [copiedId, setCopiedId]       = useState<string | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  const [quota, setQuota]         = useState(FREE_QUOTA);
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [quotaExpiry, setQuotaExpiry] = useState<Date | null>(null);
  const [wholesalerBusinessType, setWholesalerBusinessType] = useState<string | null>(null);
  const [businessTypeFilter, setBusinessTypeFilter] = useState<boolean>(() => {
    try { return localStorage.getItem('doyang_btype_filter') === 'true'; } catch { return false; }
  });

  const toggleFilter = (val: boolean) => {
    setBusinessTypeFilter(val);
    try { localStorage.setItem('doyang_btype_filter', String(val)); } catch {}
  };

  const [paymentOpen, setPaymentOpen]   = useState(false);
  const [selectedTier, setSelectedTier] = useState<typeof PAYMENT_TIERS[0] | null>(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentStep, setPaymentStep]   = useState<'tiers' | 'phone' | 'initiating' | 'waiting' | 'success' | 'error'>('tiers');
  const [paymentTxRef, setPaymentTxRef] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentCountdown, setPaymentCountdown] = useState(90);
  const pendingTierRef = useRef<typeof PAYMENT_TIERS[0] | null>(null);
  const [offerTarget, setOfferTarget] = useState<LoanOfferTarget | null>(null);
  const { user } = useAuth();

  const copyEmail = (id: string, email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const copyPhone = (id: string, phone: string) => {
    navigator.clipboard.writeText(phone).then(() => {
      setCopiedPhoneId(id);
      setTimeout(() => setCopiedPhoneId(null), 2000);
    });
  };

  useEffect(() => {
    const loadQuota = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', wholesalerUid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setWholesalerBusinessType(data.businessType ?? '');
          const expiresAt: Date | null = data.slotExpiresAt?.toDate?.() ?? null;
          const now = Date.now();
          if (expiresAt && expiresAt.getTime() > now) {
            setQuota(data.slotQuota ?? FREE_QUOTA);
            setQuotaExpiry(expiresAt);
          } else if (expiresAt) {
            // Slot expired — fall back to free
            setQuota(FREE_QUOTA);
            setQuotaExpiry(null);
          } else if (data.slotQuota) {
            // Legacy entry with no expiry — honour it
            setQuota(data.slotQuota);
          }
        } else {
          setWholesalerBusinessType('');
        }
      } catch (e) {
        console.error('[slot] Failed to load quota from users doc:', e);
        setWholesalerBusinessType('');
      }
      setQuotaLoading(false);
    };
    loadQuota();
  }, [wholesalerUid]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const bType = wholesalerBusinessType;
      const baseQueries: Promise<any>[] = [
        getDocs(query(collection(db, 'retailer_reports'), where('visibility', '==', 'public'))),
        getDocs(query(collection(db, 'retailer_reports'), where('allowedWholesalers', 'array-contains', wholesalerUid))),
      ];
      if (bType) {
        baseQueries.push(
          getDocs(query(
            collection(db, 'retailer_reports'),
            where('visibility', '==', 'sameBusiness'),
            where('businessType', '==', bType),
          )).catch((e) => {
            console.warn('[Doyang] sameBusiness query needs a Firestore composite index. Create it here:', e?.message?.match(/https[^\s]*/)?.[0] ?? 'https://console.firebase.google.com');
            return { docs: [] };
          })
        );
      }
      const snaps = await Promise.all(baseQueries);
      const seen = new Set<string>();
      const combined: ReportSummary[] = [];
      for (const snap of snaps) {
        for (const d of snap.docs) {
          if (!seen.has(d.id)) { seen.add(d.id); combined.push(d.data() as ReportSummary); }
        }
      }
      combined.sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : a.dateAdded > b.dateAdded ? -1 : 0));
      setReports(combined);
    } catch (e: any) {
      setError(e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (wholesalerBusinessType === null) return;
    fetchReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholesalerUid, wholesalerBusinessType]);

  useEffect(() => {
    if (paymentStep !== 'waiting') return;
    const id = setInterval(() => {
      setPaymentCountdown(c => {
        if (c <= 1) { setPaymentStep('error'); setPaymentError('Payment timed out. Please try again.'); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paymentStep]);

  useEffect(() => {
    if (paymentStep !== 'waiting' || !paymentTxRef) return;
    const id = setInterval(async () => {
      try {
        const res  = await fetch(`/api/payment/status/${paymentTxRef}`);
        const data = await res.json();
        if (data.success && data.data?.status === 'completed') {
          clearInterval(id);
          const tier = pendingTierRef.current;
          if (tier) {
            try {
              const token = await auth.currentUser?.getIdToken();
              const upgradeRes = await fetch('/api/wholesaler/upgrade-quota', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Firebase-Token': token ?? '' },
                body: JSON.stringify({ reference: paymentTxRef }),
              });
              const upgradeData = await upgradeRes.json();
              if (upgradeData.success) {
                setQuota(upgradeData.newQuota);
                setQuotaExpiry(new Date(upgradeData.expiresAt));
              } else {
                console.error('[slot] Quota upgrade rejected by server:', upgradeData.error);
              }
            } catch (e) {
              console.error('[slot] Quota upgrade request failed:', e);
            }
          }
          setPaymentStep('success');
        }
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [paymentStep, paymentTxRef, wholesalerUid]);

  const openPayment = () => {
    setPaymentOpen(true);
    setPaymentStep('tiers');
    setSelectedTier(null);
    setPaymentPhone('');
    setPaymentTxRef(null);
    setPaymentError(null);
    setPaymentCountdown(90);
  };

  const initiatePayment = async () => {
    if (!selectedTier) return;
    setPaymentStep('initiating');
    setPaymentError(null);
    pendingTierRef.current = selectedTier;
    try {
      const token = await import('@/lib/firebase').then(m => m.auth.currentUser?.getIdToken().catch(() => null) ?? null);
      const res  = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phone: paymentPhone,
          amount: selectedTier.amount,
          email: user?.email ?? 'payments@doyang.app',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || data.message || 'Payment initiation failed');
      setPaymentTxRef(data.data?.reference ?? null);
      setPaymentStep('waiting');
      setPaymentCountdown(90);
    } catch (e: any) {
      setPaymentError(e.message || 'Failed to initiate payment');
      setPaymentStep('error');
    }
  };

  const isSearching   = search.trim().length > 0;
  const searchResults = isSearching
    ? reports.filter(r => {
        const q = search.toLowerCase();
        return r.retailerName?.toLowerCase().includes(q) || r.customerName?.toLowerCase().includes(q);
      })
    : [];
  const displayReports = (businessTypeFilter && wholesalerBusinessType)
    ? reports.filter(r => r.businessType === wholesalerBusinessType)
    : reports;
  const visibleReports = displayReports.slice(0, quota);
  const lockedCount    = Math.max(0, displayReports.length - quota);

  if (loading || quotaLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Fetching retailer data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle size={40} className="text-destructive" />
        <p className="text-sm text-muted-foreground text-center max-w-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchReports}><RefreshCw size={14} className="mr-2" /> Retry</Button>
      </div>
    );
  }

  return (
    <>
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Quota bar */}
      <div className="px-4 sm:px-6 pt-4 pb-2 flex items-center gap-2">
        <div className="flex-1 text-xs text-muted-foreground min-w-0">
          Showing <span className="font-semibold text-foreground">{Math.min(quota, displayReports.length)}</span> of{' '}
          <span className="font-semibold text-foreground">{displayReports.length}</span> retailers · Slot limit:{' '}
          <span className="font-semibold text-amber-400">{quota}</span>
          {quotaExpiry && (
            <span className="ml-1.5 text-muted-foreground/60">
              · Active until <span className="text-foreground/70">{quotaExpiry.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </span>
          )}
        </div>
        <button
          onClick={openPayment}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-1.5 shrink-0"
        >
          <CreditCard size={12} /> Upgrade Slots
        </button>
        <Button variant="outline" size="sm" onClick={fetchReports} className="gap-2 shrink-0">
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* View mode setting — only shown when wholesaler has a business type */}
      {wholesalerBusinessType && (
        <div className="px-4 sm:px-6 pb-3">
          <div className="flex items-center gap-3 bg-muted/20 border border-border/60 rounded-xl px-4 py-2.5">
            <Filter size={12} className="text-muted-foreground shrink-0" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">View</span>
            <div className="flex ml-auto bg-muted rounded-lg p-0.5">
              <button
                onClick={() => toggleFilter(false)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                  !businessTypeFilter
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All available
              </button>
              <button
                onClick={() => toggleFilter(true)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                  businessTypeFilter
                    ? 'bg-green-500/20 text-green-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {wholesalerBusinessType} only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="px-4 sm:px-6 py-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search retailers by business name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-6 pt-2">

        {/* ── SEARCH MODE: only business names + Manage button ── */}
        {isSearching && (
          <>
            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
                <Search size={32} className="opacity-20" />
                <p className="text-sm">No retailers match your search.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground pb-1">
                  {searchResults.length} retailer{searchResults.length !== 1 ? 's' : ''} found · Click <span className="text-amber-400 font-semibold">Manage</span> to unlock more slots
                </p>
                {searchResults.map((r, i) => (
                  <div key={r.id + i} className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground truncate">{r.retailerName || r.customerName || '—'}</p>
                      {r.customerName && r.retailerName && (
                        <p className="text-xs text-muted-foreground truncate">{r.customerName}</p>
                      )}
                    </div>
                    <button
                      onClick={openPayment}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Manage <ChevronRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── DASHBOARD MODE: full credit reports up to quota ── */}
        {!isSearching && (
          <>
            {reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
                <Users size={36} className="opacity-20" />
                <p className="text-sm">No retailer reports yet.</p>
                <p className="text-xs opacity-60 text-center">Reports appear here once retailers submit M-Pesa statements.</p>
              </div>
            ) : (
              <>
                {/* ── Mobile cards ── */}
                <div className="sm:hidden space-y-3">
                  {visibleReports.map((r, i) => {
                    const s = scoreStyle(r.score);
                    const period = formatPeriod(r.periodStart, r.periodEnd);
                    const limitText = r.creditLimit != null && r.creditLimit > 0
                      ? `KES ${r.creditLimit >= 1000 ? `${(r.creditLimit / 1000).toFixed(r.creditLimit % 1000 === 0 ? 0 : 1)}K` : r.creditLimit.toLocaleString()}`
                      : '—';
                    return (
                      <div key={r.id + i} className="bg-card border border-border rounded-xl overflow-hidden">

                        {/* ── Main details ── */}
                        <div className="px-5 py-4">

                          {/* Name + score pill */}
                          <div className="flex items-center justify-between gap-3 mb-2.5">
                            <p className="font-medium text-base text-foreground truncate">{r.customerName || r.retailerName || '—'}</p>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-medium border shrink-0 ${s.bg} ${s.text} ${s.border}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                              {r.score}
                            </div>
                          </div>

                          {/* Business type + grade */}
                          <div className="flex items-center gap-2 mb-3">
                            <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground min-w-0">
                              <Briefcase size={15} className="shrink-0" />
                              <span className="truncate">{r.businessType || r.retailerName || '—'}</span>
                            </div>
                            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-md bg-muted/60 ${s.text}`}>{r.grade}</span>
                          </div>

                          {/* Contact rows */}
                          <div className="flex flex-col gap-1.5 mb-3">
                            {r.customerPhone && (
                              <div className="flex items-center gap-2 group">
                                <Phone size={15} className="text-muted-foreground shrink-0" />
                                <a href={`tel:${r.customerPhone}`} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">{r.customerPhone}</a>
                                <button onClick={() => copyPhone(r.id, r.customerPhone!)} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Copy">
                                  {copiedPhoneId === r.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-muted-foreground" />}
                                </button>
                              </div>
                            )}
                            {r.retailerEmail && (
                              <div className="flex items-center gap-2 group">
                                <Mail size={15} className="text-muted-foreground shrink-0" />
                                <a href={`mailto:${r.retailerEmail}`} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors truncate">{r.retailerEmail}</a>
                                <button onClick={() => copyEmail(r.id, r.retailerEmail)} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Copy">
                                  {copiedId === r.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-muted-foreground" />}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Date + period */}
                          <p className="text-xs text-muted-foreground/70">
                            Added {formatDate(r.dateAdded)}{period ? ` · M-Pesa: ${period}` : ''}
                          </p>
                        </div>

                        {/* ── Suggested credit limit ── */}
                        <div className="border-t border-border px-5 py-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                            <CreditCard size={17} className="shrink-0" />
                            Suggested credit limit
                          </div>
                          <p className={`text-lg font-medium ${r.creditLimit != null && r.creditLimit > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                            {limitText}
                          </p>
                        </div>

                        {/* ── Offer loan button ── */}
                        {r.retailerUid && (
                          <div className="border-t border-border px-5 py-3">
                            <button
                              onClick={() => setOfferTarget({ id: r.id, retailerUid: r.retailerUid!, retailerName: r.retailerName, retailerEmail: r.retailerEmail, retailerPhone: r.customerPhone, score: r.score, grade: r.grade, label: r.label, creditLimit: r.creditLimit })}
                              className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-colors hover:bg-primary/90"
                            >
                              Offer loan
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Desktop cards (key-value layout) ── */}
                <div className="hidden sm:block space-y-3">
                  {visibleReports.map((r, i) => {
                    const s = scoreStyle(r.score);
                    const period = formatPeriod(r.periodStart, r.periodEnd);
                    const limitText = r.creditLimit != null && r.creditLimit > 0
                      ? `KES ${r.creditLimit >= 1000 ? `${(r.creditLimit / 1000).toFixed(r.creditLimit % 1000 === 0 ? 0 : 1)}K` : r.creditLimit.toLocaleString()}`
                      : '—';
                    return (
                      <div key={r.id + i} className="bg-card border border-border rounded-xl overflow-hidden">
                        {/* Each row: label (fixed left) | value (right) */}
                        <div className="divide-y divide-border">

                          {/* Retailer */}
                          <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 items-center">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Retailer</span>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              <p className="font-medium text-sm text-foreground">{r.customerName || r.retailerName || '—'}</p>
                              {r.businessType && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Briefcase size={12} className="shrink-0" />
                                  {r.businessType}
                                </div>
                              )}
                              {r.customerPhone && (
                                <div className="flex items-center gap-1.5 group">
                                  <Phone size={12} className="text-muted-foreground shrink-0" />
                                  <a href={`tel:${r.customerPhone}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{r.customerPhone}</a>
                                  <button onClick={() => copyPhone(r.id, r.customerPhone!)} className="opacity-0 group-hover:opacity-100 transition-opacity" title="Copy">
                                    {copiedPhoneId === r.id ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-muted-foreground" />}
                                  </button>
                                </div>
                              )}
                              {r.retailerEmail && (
                                <div className="flex items-center gap-1.5 group">
                                  <Mail size={12} className="text-muted-foreground shrink-0" />
                                  <a href={`mailto:${r.retailerEmail}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{r.retailerEmail}</a>
                                  <button onClick={() => copyEmail(r.id, r.retailerEmail)} className="opacity-0 group-hover:opacity-100 transition-opacity" title="Copy">
                                    {copiedId === r.id ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-muted-foreground" />}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Credit Score */}
                          <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 items-center">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credit Score</span>
                            <div className="flex items-center gap-3">
                              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-medium border ${s.bg} ${s.text} ${s.border}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                                {r.score}
                              </div>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-md bg-muted/60 ${s.text}`}>{r.grade}</span>
                              <span className={`text-xs ${s.text}`}>{r.label}</span>
                            </div>
                          </div>

                          {/* Statement Period */}
                          <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 items-center">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statement Period</span>
                            <div className="flex items-center gap-1.5">
                              <Calendar size={13} className={period ? 'text-muted-foreground' : 'text-muted-foreground/40'} />
                              <span className={`text-sm ${period ? 'text-foreground' : 'text-muted-foreground/40'}`}>{period || 'N/A'}</span>
                            </div>
                          </div>

                          {/* Date Added */}
                          <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 items-center">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Added</span>
                            <span className="text-sm text-foreground">{formatDate(r.dateAdded)}</span>
                          </div>

                          {/* Credit Limit */}
                          <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 items-center">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credit Limit</span>
                            <div className="flex items-center gap-2">
                              <CreditCard size={15} className="text-muted-foreground shrink-0" />
                              <span className={`text-sm font-medium ${r.creditLimit != null && r.creditLimit > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>{limitText}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3 items-center">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</span>
                            {r.retailerUid ? (
                              <button
                                onClick={() => setOfferTarget({ id: r.id, retailerUid: r.retailerUid!, retailerName: r.retailerName, retailerEmail: r.retailerEmail, retailerPhone: r.customerPhone, score: r.score, grade: r.grade, label: r.label, creditLimit: r.creditLimit })}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium transition-colors hover:bg-primary/90"
                              >
                                Offer loan
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Locked rows banner ── */}
                {lockedCount > 0 && (
                  <div className="mt-4 border border-dashed border-amber-500/30 rounded-xl p-5 flex flex-col sm:flex-row items-center gap-4 bg-amber-500/5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                      <Lock size={18} className="text-amber-400" />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <p className="text-sm font-semibold text-foreground">
                        {lockedCount} more retailer{lockedCount !== 1 ? 's' : ''} locked
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Upgrade your slot limit to view their credit reports.
                      </p>
                    </div>
                    <button
                      onClick={openPayment}
                      className="shrink-0 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs rounded-lg px-4 py-2 transition-colors"
                    >
                      <CreditCard size={13} /> Unlock More
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>

    {/* ── M-Pesa Payment Modal ── */}
    {paymentOpen && (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-br from-amber-900/40 to-amber-800/10 border-b border-border p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <CreditCard size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Upgrade Retailer Slots</p>
              <p className="text-xs text-muted-foreground">Pay via M-Pesa · Current limit: {quota}</p>
            </div>
            <button onClick={() => setPaymentOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4">

            {/* Step: choose tier */}
            {paymentStep === 'tiers' && (
              <>
                <p className="text-xs text-muted-foreground">Select a plan to expand how many retailer credit reports you can access:</p>
                <div className="space-y-2">
                  {PAYMENT_TIERS.map(tier => (
                    <button
                      key={tier.amount}
                      onClick={() => setSelectedTier(tier)}
                      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                        selectedTier?.amount === tier.amount
                          ? 'border-amber-500/60 bg-amber-500/10'
                          : 'border-border bg-muted/20 hover:border-amber-500/30 hover:bg-amber-500/5'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                        selectedTier?.amount === tier.amount ? 'border-amber-400' : 'border-muted-foreground/40'
                      }`}>
                        {selectedTier?.amount === tier.amount && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{tier.label}</p>
                        {tier.badge && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded-full px-1.5 py-0.5">{tier.badge}</span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-foreground">KSh {tier.amount}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-2"
                  onClick={() => { if (selectedTier) setPaymentStep('phone'); }}
                  disabled={!selectedTier}
                >
                  Continue <ChevronRight size={14} />
                </Button>
              </>
            )}

            {/* Step: enter phone */}
            {(paymentStep === 'phone' || paymentStep === 'initiating') && selectedTier && (
              <>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{selectedTier.label}</p>
                  <p className="text-sm font-bold text-amber-400">KSh {selectedTier.amount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-3 leading-relaxed">Enter your Safaricom number to receive the M-Pesa prompt.</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">+254</span>
                    <Input
                      type="tel"
                      placeholder="7XX XXX XXX"
                      value={paymentPhone}
                      onChange={e => setPaymentPhone(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && paymentPhone.trim() && paymentStep === 'phone') initiatePayment(); }}
                      className="pl-12 text-sm"
                      disabled={paymentStep === 'initiating'}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPaymentStep('tiers')} disabled={paymentStep === 'initiating'}>Back</Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold gap-2"
                    onClick={initiatePayment}
                    disabled={!paymentPhone.trim() || paymentStep === 'initiating'}
                  >
                    {paymentStep === 'initiating'
                      ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Sending…</>
                      : <><Smartphone size={14} />Pay via M-Pesa</>}
                  </Button>
                </div>
              </>
            )}

            {/* Step: waiting */}
            {paymentStep === 'waiting' && (
              <>
                <div className="text-center py-2 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
                    <span className="w-6 h-6 border-[3px] border-green-500/30 border-t-green-400 rounded-full animate-spin block" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">Check your phone</p>
                    <p className="text-xs text-muted-foreground mt-1">Enter your M-Pesa PIN to pay <span className="font-semibold text-foreground">KSh {selectedTier?.amount}</span></p>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-3 py-2 inline-block">
                    <p className="text-xs text-muted-foreground">
                      Expires in <span className="font-mono font-semibold text-foreground">
                        {Math.floor(paymentCountdown / 60)}:{String(paymentCountdown % 60).padStart(2, '0')}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">Payment detected automatically after you confirm on your phone.</p>
                <button onClick={() => setPaymentOpen(false)} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">Cancel</button>
              </>
            )}

            {/* Step: success */}
            {paymentStep === 'success' && (
              <>
                <div className="text-center py-4 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
                    <Check size={28} className="text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Payment confirmed!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your slot limit is now <span className="font-bold text-amber-400">{quota}</span> retailers.
                    </p>
                  </div>
                </div>
                <Button className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold" onClick={() => setPaymentOpen(false)}>View Dashboard</Button>
              </>
            )}

            {/* Step: error */}
            {paymentStep === 'error' && (
              <>
                <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive leading-snug">{paymentError || 'Payment failed. Please try again.'}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setPaymentStep('tiers'); setSelectedTier(null); }}>Change Plan</Button>
                  <Button variant="outline" className="flex-1" onClick={() => { setPaymentStep('phone'); setPaymentError(null); }}>Try Again</Button>
                </div>
                <button onClick={() => setPaymentOpen(false)} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">Cancel</button>
              </>
            )}

          </div>
        </div>
      </div>
    )}

    {offerTarget && (
      <LoanOfferModal
        retailer={offerTarget}
        wholesaler={{
          uid: wholesalerUid,
          name: user?.displayName || user?.email?.split('@')[0] || 'Wholesaler',
          email: user?.email || '',
        }}
        onClose={() => setOfferTarget(null)}
      />
    )}
    </>
  );
}

function WholesalerDashboard() {
  const { user, signOut, deleteAccount } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'retailers' | 'loans'>('retailers');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [showSettlementSettings, setShowSettlementSettings] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) { setDeleteError('Please enter your password to confirm.'); return; }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setDeleteError('Incorrect password. Please try again.');
      } else if (code.includes('too-many-requests')) {
        setDeleteError('Too many attempts. Please wait before trying again.');
      } else {
        setDeleteError('Failed to delete account. Please try again.');
      }
      setDeleteLoading(false);
    }
  };

  return (<>
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="fixed inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.6)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.6)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-card/60 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Building2 size={16} className="text-amber-400" />
          </div>
          <span className="text-sm font-bold text-foreground">Doyang</span>
          <span className="text-xs text-amber-400 font-semibold hidden xs:inline">· Wholesaler</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[140px]">
            {user?.displayName || user?.email?.split('@')[0]}
          </span>
          <NotificationCenter />
          <Button variant="ghost" size="sm" onClick={() => setShowSettlementSettings(true)} className="gap-1.5 text-muted-foreground hover:text-amber-400 text-xs px-2" title="Settlement account settings">
            <Settings size={13} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError(null); }} className="gap-1.5 text-muted-foreground hover:text-destructive text-xs px-2" title="Delete account">
            <Trash2 size={13} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5 text-muted-foreground hover:text-foreground text-xs px-2 sm:px-3">
            <LogOut size={13} /> <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Settlement banner — shown to wholesalers who haven't connected a bank account */}
      <WholesalerSettlementBanner />

      {/* Tab switcher */}
      <div className="relative z-10 px-4 sm:px-6 pt-4 pb-0 shrink-0">
        <div className="flex items-center gap-1 border-b border-border">
          <button
            onClick={() => setActiveTab('retailers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === 'retailers'
                ? 'border-amber-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users size={14} />
            Retailers
          </button>
          <button
            onClick={() => setActiveTab('loans')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === 'loans'
                ? 'border-amber-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Banknote size={14} />
            Active Loans
          </button>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {activeTab === 'retailers'
          ? <RetailersManagedTab wholesalerUid={user!.uid} />
          : <WholesalerLoansTab wholesalerUid={user!.uid} />
        }
      </div>
    </div>

    {showSettlementSettings && (
      <WholesalerSettlementSettings onClose={() => setShowSettlementSettings(false)} />
    )}

    {showDeleteModal && (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}>
        <div className="bg-card border border-destructive/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Delete Account</h3>
              <p className="text-xs text-muted-foreground">This cannot be undone</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            This will permanently delete your wholesaler account and all associated data. Enter your password to confirm.
          </p>
          <div className="relative mb-3">
            <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              placeholder="Your password"
              value={deletePassword}
              onChange={e => { setDeletePassword(e.target.value); setDeleteError(null); }}
              onKeyDown={e => e.key === 'Enter' && handleDeleteAccount()}
              className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-destructive"
              autoFocus
            />
          </div>
          {deleteError && (
            <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={12} className="shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteLoading}
              className="flex-1 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteLoading}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-destructive hover:bg-destructive/90 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {deleteLoading ? (
                <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</>
              ) : (
                <><Trash2 size={12} />Delete My Account</>
              )}
            </button>
          </div>
        </div>
      </div>
    )}
  </>);
}

export default function WholesalerPage() {
  const { user, loading, profileComplete, signOut, needsSettlementOnboarding, completeSettlementOnboarding } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return <WholesalerAuthPage />;

  if (!user.emailVerified) return <EmailVerificationBanner />;

  if (profileComplete === false) return <CompleteProfileScreen role="wholesaler" />;

  if (needsSettlementOnboarding) {
    return <WholesalerSettlementOnboarding onComplete={completeSettlementOnboarding} fullscreen />;
  }

  if (user.role === 'retailer') {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30">
            <Building2 size={28} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Wrong Portal</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Your account is registered as a{' '}
              <span className="font-semibold text-foreground">Retailer</span>.
              This is the <span className="font-semibold text-foreground">Wholesaler Portal</span>.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <a
              href="/retailer"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 transition-colors text-sm"
            >
              <Building2 size={15} />
              Go to Retailer Portal
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

  if (user.role === 'buyer') { window.location.href = '/buyer'; return null; }
  return <WholesalerDashboard />;
}
