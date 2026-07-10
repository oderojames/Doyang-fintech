import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import {
  Banknote, ChevronDown, CheckCircle2, Clock, Loader2,
  AlertCircle, RefreshCw, Zap, XCircle, Star, ArrowDownToLine,
  RotateCcw, TriangleAlert,
} from 'lucide-react';

type RepayStatus = 'upcoming' | 'due' | 'processing' | 'paid' | 'overdue' | 'failed';
type SettlementStatus = 'settled' | 'pending_subaccount';

interface Repayment {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  remainingBalance: number;
  status: RepayStatus;
  paidAt: string | null;
  failureReason?: string;
  paystackReference?: string;
  wholesalerShare?: number;
  platformShare?: number;
  splitCode?: string | null;
  settlementStatus?: SettlementStatus;
  settlementAt?: string | null;
  retryCount?: number;
  nextRetryAt?: string | null;
  retriesExhausted?: boolean;
  lastFailedAt?: string | null;
}

interface LoanOffer {
  id: string;
  retailerName: string;
  retailerEmail: string;
  principal: number;
  interestRate: number;
  interestType: 'flat' | 'reducing';
  repaymentFrequency: 'weekly' | 'biweekly' | 'monthly';
  installments: number;
  startDate: string;
  totalRepayable: number;
  totalInterest: number;
  status: 'active' | 'completed' | 'defaulted' | 'pending_retailer_acceptance' | 'declined';
  activatedAt?: string;
  createdAt: string;
  defaultedAt?: string;
}

const FREQ: Record<string, string> = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' };

function kes(n: number) {
  return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(iso: string) {
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

async function getToken(): Promise<string | null> {
  try { return await auth.currentUser?.getIdToken() ?? null; } catch { return null; }
}

function repayStatusBadge(r: Repayment) {
  switch (r.status) {
    case 'paid': return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-500/15 border border-green-500/30 text-green-400">
        <CheckCircle2 size={8} /> Paid
      </span>
    );
    case 'due': {
      const isRetry = (r.retryCount ?? 0) > 0;
      return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold
          ${isRetry
            ? 'bg-orange-500/15 border border-orange-500/30 text-orange-400'
            : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'}`}>
          {isRetry ? <RotateCcw size={8} /> : <AlertCircle size={8} />}
          {isRetry ? `Retry ${r.retryCount}` : 'Due'}
        </span>
      );
    }
    case 'processing': return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/15 border border-blue-500/30 text-blue-400">
        <Loader2 size={8} className="animate-spin" /> Processing
      </span>
    );
    case 'failed': return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/15 border border-red-500/30 text-red-400">
        <XCircle size={8} /> Failed
      </span>
    );
    case 'overdue': return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/15 border border-red-500/30 text-red-400">
        <XCircle size={8} /> Overdue
      </span>
    );
    default: return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-muted border border-border text-muted-foreground">
        <Clock size={8} /> Upcoming
      </span>
    );
  }
}

interface LoanCardProps {
  offer: LoanOffer;
}

function LoanCard({ offer }: LoanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loadingRepay, setLoadingRepay] = useState(false);
  const [repayError, setRepayError] = useState('');

  const isActive    = offer.status === 'active';
  const isCompleted = offer.status === 'completed';
  const isDefaulted = offer.status === 'defaulted';

  const fetchRepayments = useCallback(async () => {
    setLoadingRepay(true);
    setRepayError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`/api/loan-offers/${offer.id}/repayments`, {
        headers: { 'X-Firebase-Token': token },
      });
      const json = await res.json() as { success?: boolean; repayments?: Repayment[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setRepayments(json.repayments ?? []);
    } catch (e) {
      setRepayError(e instanceof Error ? e.message : 'Failed to load installments');
    } finally {
      setLoadingRepay(false);
    }
  }, [offer.id]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && repayments.length === 0) fetchRepayments();
  };

  const paidCount     = repayments.filter(r => r.status === 'paid').length;
  const failedCount   = repayments.filter(r => r.status === 'failed').length;
  const totalPaid     = repayments.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
  const outstanding   = offer.totalRepayable - totalPaid;
  const progressPct   = repayments.length > 0 ? Math.round((paidCount / repayments.length) * 100) : 0;

  const nextDue = repayments.find(r => r.status === 'due' || r.status === 'upcoming');
  const nextRetrying = repayments.find(r => r.status === 'due' && (r.retryCount ?? 0) > 0);

  const borderClass = isActive
    ? 'border-green-500/20'
    : isCompleted
    ? 'border-primary/20'
    : isDefaulted
    ? 'border-red-500/30'
    : 'border-border';

  const statusBadge = isActive ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 border border-green-500/30 text-green-400">
      <Zap size={9} /> Active
    </span>
  ) : isCompleted ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 border border-primary/30 text-primary">
      <Star size={9} /> Completed
    </span>
  ) : isDefaulted ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400">
      <TriangleAlert size={9} /> Defaulted
    </span>
  ) : null;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${borderClass}`}>
      <div className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{offer.retailerName || offer.retailerEmail}</p>
            <p className="text-[11px] text-muted-foreground">
              Issued {fmt(offer.createdAt)}
              {offer.activatedAt && <> · Activated {fmt(offer.activatedAt)}</>}
            </p>
          </div>
          {statusBadge}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/30 border border-border/50 px-2 py-2 text-center">
            <p className="text-[10px] text-muted-foreground">Principal</p>
            <p className="text-xs font-bold text-foreground mt-0.5">KES {offer.principal.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border/50 px-2 py-2 text-center">
            <p className="text-[10px] text-muted-foreground">Schedule</p>
            <p className="text-xs font-bold text-foreground mt-0.5">{offer.installments}× {FREQ[offer.repaymentFrequency]}</p>
          </div>
          <div className="rounded-lg bg-muted/30 border border-border/50 px-2 py-2 text-center">
            <p className="text-[10px] text-muted-foreground">Total repayable</p>
            <p className="text-xs font-bold text-amber-400 mt-0.5">KES {offer.totalRepayable.toLocaleString('en-KE', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>

        {/* Progress */}
        {repayments.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">
                {paidCount} of {repayments.length} installments paid
                {failedCount > 0 && <span className="text-red-400 ml-1">· {failedCount} failed</span>}
              </span>
              <span className="font-semibold text-foreground">{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full flex rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
                {failedCount > 0 && (
                  <div
                    className="h-full bg-red-500/60 transition-all duration-500"
                    style={{ width: `${Math.round((failedCount / repayments.length) * 100)}%` }}
                  />
                )}
              </div>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-green-400">Collected: {kes(totalPaid)}</span>
              <span className="text-amber-400">Outstanding: {kes(Math.max(0, outstanding))}</span>
            </div>
          </div>
        )}

        {/* Status banners */}
        {isActive && nextRetrying && !nextDue?.nextRetryAt && (
          <div className="flex items-center gap-2 rounded-lg bg-orange-500/5 border border-orange-500/20 px-3 py-2">
            <RotateCcw size={11} className="text-orange-400 shrink-0" />
            <p className="text-xs text-foreground">
              Retry #{nextRetrying.retryCount} scheduled:{' '}
              <span className="font-semibold">{nextRetrying.nextRetryAt ? fmt(nextRetrying.nextRetryAt) : '—'}</span>
              {' '}· <span className="text-muted-foreground">{nextRetrying.failureReason}</span>
            </p>
          </div>
        )}

        {isActive && nextDue && (nextDue.retryCount ?? 0) === 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
            <Clock size={11} className="text-amber-400 shrink-0" />
            <p className="text-xs text-foreground">
              Next payment: <span className="font-semibold">{kes(nextDue.amount)}</span>
              {' '}— <span className="font-semibold">{nextDue.status === 'due' ? 'Due now' : `due ${fmt(nextDue.dueDate)}`}</span>
            </p>
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
            <CheckCircle2 size={11} className="text-primary shrink-0" />
            <p className="text-xs text-foreground font-medium">Loan fully repaid · {kes(offer.totalRepayable)} collected</p>
          </div>
        )}

        {isDefaulted && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
            <TriangleAlert size={11} className="text-red-400 shrink-0" />
            <p className="text-xs text-foreground">
              Loan defaulted{offer.defaultedAt ? ` on ${fmt(offer.defaultedAt)}` : ''} — all repayment retries exhausted.
            </p>
          </div>
        )}

        {/* Expand toggle */}
        <button onClick={handleExpand}
          className="w-full flex items-center justify-between text-xs text-primary hover:text-primary/80 transition-colors">
          <span>{expanded ? 'Hide' : 'View'} installment breakdown ({offer.installments} installments)</span>
          <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Repayments table */}
        {expanded && (
          <div>
            {loadingRepay ? (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-xs">
                <Loader2 size={13} className="animate-spin" /> Loading installments…
              </div>
            ) : repayError ? (
              <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle size={12} className="shrink-0" />
                {repayError}
                <button onClick={fetchRepayments} className="ml-auto underline">Retry</button>
              </div>
            ) : repayments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No installments found.</p>
            ) : (
              <div className="space-y-2">
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium text-left">#</th>
                        <th className="px-2 py-1.5 font-medium text-left">Due date</th>
                        <th className="px-2 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-2 py-1.5 font-medium text-right text-amber-400/80">Your share</th>
                        <th className="px-2 py-1.5 font-medium text-center">Status</th>
                        <th className="px-2 py-1.5 font-medium text-center">Settlement</th>
                        <th className="px-2 py-1.5 font-medium text-left">Paid / Next retry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repayments.map(r => (
                        <tr key={r.installmentNumber}
                          className={`border-t border-border/40
                            ${r.status === 'paid'   ? 'bg-green-500/[0.03]'  : ''}
                            ${r.status === 'due' && (r.retryCount ?? 0) > 0 ? 'bg-orange-500/[0.04]' : ''}
                            ${r.status === 'due' && (r.retryCount ?? 0) === 0 ? 'bg-amber-500/[0.03]' : ''}
                            ${r.status === 'failed' ? 'bg-red-500/[0.04]'    : ''}
                          `}>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.installmentNumber}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{fmt(r.dueDate)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">{kes(r.amount)}</td>
                          <td className="px-2 py-1.5 text-right">
                            {r.status === 'paid' && r.wholesalerShare != null ? (
                              <span className="font-bold text-amber-400">{kes(r.wholesalerShare)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">{repayStatusBadge(r)}</td>
                          <td className="px-2 py-1.5 text-center">
                            {r.status === 'paid' ? (
                              r.settlementStatus === 'settled' ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-500/15 border border-green-500/30 text-green-400 whitespace-nowrap">
                                  <ArrowDownToLine size={7} /> Settled
                                </span>
                              ) : r.settlementStatus === 'pending_subaccount' ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 whitespace-nowrap">
                                  <Clock size={7} /> Pending
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                            {r.status === 'paid' && r.paidAt
                              ? fmt(r.paidAt)
                              : r.status === 'failed'
                              ? <span className="text-red-400/80">Exhausted</span>
                              : r.nextRetryAt
                              ? <span className="text-orange-400">↺ {fmt(r.nextRetryAt)}</span>
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Failure detail rows */}
                {repayments.some(r => (r.status === 'due' && (r.retryCount ?? 0) > 0) || r.status === 'failed') && (
                  <div className="space-y-1">
                    {repayments
                      .filter(r => ((r.status === 'due' && (r.retryCount ?? 0) > 0) || r.status === 'failed') && r.failureReason)
                      .map(r => (
                        <div key={r.installmentNumber}
                          className={`flex items-start gap-2 text-[9px] px-2 py-1.5 rounded-lg
                            ${r.status === 'failed'
                              ? 'bg-red-500/8 border border-red-500/20 text-red-400/80'
                              : 'bg-orange-500/8 border border-orange-500/20 text-orange-400/80'}`}>
                          {r.status === 'failed'
                            ? <XCircle size={9} className="shrink-0 mt-px" />
                            : <RotateCcw size={9} className="shrink-0 mt-px" />}
                          <span>
                            <span className="font-semibold">#{r.installmentNumber}</span>
                            {r.status === 'failed'
                              ? ` — Retries exhausted (${r.retryCount}/${r.retryCount}): `
                              : ` — Attempt ${(r.retryCount ?? 0) + 1}: `}
                            {r.failureReason}
                            {r.status === 'due' && r.nextRetryAt && ` · Next retry: ${fmt(r.nextRetryAt)}`}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {/* Legend */}
                {repayments.some(r => r.status === 'paid') && (
                  <div className="flex flex-wrap items-center gap-3 text-[9px] text-muted-foreground px-1">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500/60 inline-block" />
                      Settled = transferred to your subaccount (90%)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500/60 inline-block" />
                      Pending = no subaccount configured
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default function WholesalerLoansTab({ wholesalerUid }: { wholesalerUid: string }) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<LoanOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'active' | 'completed' | 'defaulted' | 'all'>('active');

  const fetchLoans = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/loan-offers?wholesalerUid=${wholesalerUid}`, {
        headers: { 'X-Firebase-Token': token },
      });
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; offers: LoanOffer[] };
      if (json.success) {
        const relevant = json.offers
          .filter(o => ['active', 'completed', 'defaulted'].includes(o.status))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setOffers(relevant);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load loans');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, wholesalerUid]);

  useEffect(() => {
    fetchLoans();
    const id = setInterval(fetchLoans, 30_000);
    return () => clearInterval(id);
  }, [fetchLoans]);

  const activeCount    = offers.filter(o => o.status === 'active').length;
  const completedCount = offers.filter(o => o.status === 'completed').length;
  const defaultedCount = offers.filter(o => o.status === 'defaulted').length;

  const displayed = filter === 'all'
    ? offers
    : offers.filter(o => o.status === filter);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading loans…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <AlertCircle size={32} className="text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={fetchLoans} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Toolbar */}
      <div className="px-4 sm:px-6 pt-4 pb-3 flex items-center gap-2 shrink-0">
        <div className="flex bg-muted rounded-lg p-0.5 gap-0.5 flex-wrap">
          {([
            ['active',    'Active',    activeCount],
            ['completed', 'Completed', completedCount],
            ['defaulted', 'Defaulted', defaultedCount],
            ['all',       'All',       offers.length],
          ] as const).map(([val, label, count]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap flex items-center gap-1.5
                ${filter === val ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {label}
              {count > 0 && (
                <span className={`text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center
                  ${val === 'defaulted' && count > 0
                    ? 'bg-red-500 text-white'
                    : filter === val
                    ? 'bg-amber-500 text-black'
                    : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
        <button onClick={fetchLoans} className="ml-auto text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pb-6 space-y-3">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
            <div className="w-12 h-12 rounded-xl bg-muted/40 border border-border flex items-center justify-center">
              <Banknote size={22} className="opacity-30" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {filter === 'active'    ? 'No active loans'    :
                 filter === 'completed' ? 'No completed loans' :
                 filter === 'defaulted' ? 'No defaulted loans' : 'No loans yet'}
              </p>
              <p className="text-xs mt-1 opacity-60">
                {filter === 'active'
                  ? 'Loans will appear here once retailers activate them.'
                  : filter === 'defaulted'
                  ? 'Loans where all repayment retries were exhausted appear here.'
                  : 'Completed loans will appear here once fully repaid.'}
              </p>
            </div>
          </div>
        ) : (
          displayed.map(o => <LoanCard key={o.id} offer={o} />)
        )}
      </div>
    </div>
  );
}
