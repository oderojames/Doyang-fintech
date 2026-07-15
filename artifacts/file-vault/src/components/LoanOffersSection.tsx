import { useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  ChevronDown, CheckCircle2, XCircle, Clock,
  Loader2, AlertCircle, Zap, Calendar,
} from 'lucide-react';
import LoanAcceptanceModal, { type CardInfo } from './LoanAcceptanceModal';

interface ScheduleItem {
  no: number; dueDate: string; interest: number;
  principal: number; payment: number; balance: number;
}

export interface LoanOffer {
  id: string;
  wholesalerUid: string; wholesalerName: string; wholesalerEmail: string;
  retailerUid: string; retailerName: string; retailerEmail: string;
  reportId: string; creditLimit: number | null;
  principal: number; interestRate: number;
  interestType: 'flat' | 'reducing';
  repaymentFrequency: 'weekly' | 'biweekly' | 'monthly';
  installments: number; startDate: string;
  totalRepayable: number; totalInterest: number;
  schedule: ScheduleItem[];
  status: 'pending_retailer_acceptance' | 'active' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  activatedAt?: string;
  splitCode?: string | null;
  splitStatus?: 'active' | 'pending_subaccount' | null;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly',
};

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

interface OfferCardProps {
  offer: LoanOffer;
  cardInfo: CardInfo | null;
  onUpdate: (id: string, status: 'active' | 'declined') => void;
}

export function OfferCard({ offer, cardInfo, onUpdate }: OfferCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineError, setDeclineError] = useState('');

  const isPending = offer.status === 'pending_retailer_acceptance';
  const isActive = offer.status === 'active' || offer.status === 'accepted';
  const isDeclined = offer.status === 'declined';

  const decline = async () => {
    setDeclining(true);
    setDeclineError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`/api/loan-offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Firebase-Token': token },
        body: JSON.stringify({ status: 'declined' }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      onUpdate(offer.id, 'declined');
    } catch (e) {
      setDeclineError(e instanceof Error ? e.message : 'Failed to decline.');
      setDeclining(false);
    }
  };

  const statusBadge = isPending ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
      <Clock size={9} /> Awaiting response
    </span>
  ) : isActive ? (
    <span className="text-[10px] font-bold text-green-400">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted border border-border text-muted-foreground">
      <XCircle size={9} /> Declined
    </span>
  );

  const borderClass = isPending
    ? 'border-amber-500/30'
    : isActive
    ? 'border-green-500/30'
    : 'border-border';

  return (
    <>
      <div className={`bg-card border rounded-xl overflow-hidden ${borderClass}`}>
        <div className="p-4 space-y-3">

          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">{offer.wholesalerName || offer.wholesalerEmail}</p>
              <p className="text-[11px] text-muted-foreground">{fmt(offer.createdAt)}</p>
            </div>
            {statusBadge}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/30 border border-border/50 px-2 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">Principal</p>
              <p className="text-xs font-bold text-foreground mt-0.5">KES {offer.principal.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/50 px-2 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">Installments</p>
              <p className="text-xs font-bold text-foreground mt-0.5">{offer.installments}× {FREQ_LABELS[offer.repaymentFrequency]}</p>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/50 px-2 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">Total repayable</p>
              <p className="text-xs font-bold text-amber-400 mt-0.5">KES {offer.totalRepayable.toLocaleString('en-KE', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          {/* Details line */}
          <p className="text-[11px] text-muted-foreground">
            Rate: <span className="text-foreground font-medium">{offer.interestRate}% ({offer.interestType})</span>
            <span className="mx-2 opacity-40">·</span>
            First payment: <span className="text-foreground font-medium">{fmt(offer.startDate)}</span>
          </p>

          {/* Active loan: next payment callout */}
          {isActive && offer.schedule.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2">
              <Calendar size={12} className="text-green-400 shrink-0" />
              <p className="text-xs text-foreground">
                Next payment: <span className="font-semibold">{kes(offer.schedule[0].payment)}</span>
                {' '}due <span className="font-semibold">{fmt(offer.schedule[0].dueDate)}</span>
              </p>
            </div>
          )}

          {/* Schedule toggle */}
          <button onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between text-xs text-primary hover:text-primary/80 transition-colors">
            <span>{expanded ? 'Hide' : 'View'} repayment schedule ({offer.schedule.length} installments)</span>
            <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {expanded && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground">
                    {['#', 'Due date', 'Interest', 'Principal', 'Payment', 'Balance'].map((h, i) => (
                      <th key={h} className={`px-2 py-1.5 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {offer.schedule.map(s => (
                    <tr key={s.no} className="border-t border-border/40">
                      <td className="px-2 py-1.5 text-muted-foreground">{s.no}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{fmt(s.dueDate)}</td>
                      <td className="px-2 py-1.5 text-right text-amber-400">{kes(s.interest)}</td>
                      <td className="px-2 py-1.5 text-right">{kes(s.principal)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{kes(s.payment)}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">{kes(s.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Error */}
          {declineError && (
            <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertCircle size={12} className="shrink-0" />
              <span>{declineError}</span>
            </div>
          )}

          {/* Actions — pending only */}
          {isPending && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowModal(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors">
                <CheckCircle2 size={13} /> Review &amp; Activate
              </button>
              <button
                onClick={decline}
                disabled={declining}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-border hover:bg-muted text-foreground font-medium text-sm transition-colors disabled:opacity-50">
                {declining
                  ? <><Loader2 size={13} className="animate-spin" /> Declining…</>
                  : <><XCircle size={13} /> Decline</>}
              </button>
            </div>
          )}


        </div>
      </div>

      {showModal && (
        <LoanAcceptanceModal
          offer={offer}
          cardInfo={cardInfo}
          onClose={() => setShowModal(false)}
          onActivated={() => onUpdate(offer.id, 'active')}
        />
      )}
    </>
  );
}

