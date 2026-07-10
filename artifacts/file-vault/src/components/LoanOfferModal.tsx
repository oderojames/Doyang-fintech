import { useState, useMemo } from 'react';
import { X, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Banknote, ChevronDown } from 'lucide-react';
import { auth } from '@/lib/firebase';

export interface LoanOfferTarget {
  id: string;
  retailerUid: string;
  retailerName: string;
  retailerEmail: string;
  score: number;
  grade: string;
  label: string;
  creditLimit?: number | null;
}

interface WholesalerInfo {
  uid: string;
  name: string;
  email: string;
}

interface Installment {
  no: number;
  dueDate: string;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
}

type InterestType = 'flat' | 'reducing';
type Frequency = 'weekly' | 'biweekly' | 'monthly';
type Step = 'form' | 'preview' | 'success';

const FREQ_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
};

function getScoreBar(score: number): string {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#3b82f6';
  if (score >= 55) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function scoreStyle(score: number) {
  if (score >= 85) return { text: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/30' };
  if (score >= 70) return { text: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' };
  if (score >= 55) return { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' };
  if (score >= 40) return { text: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30' };
  return { text: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' };
}

function addPeriods(date: Date, freq: Frequency, n: number): Date {
  const d = new Date(date);
  if (freq === 'weekly') d.setDate(d.getDate() + 7 * n);
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14 * n);
  else d.setMonth(d.getMonth() + n);
  return d;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function kes(n: number) {
  return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildSchedule(
  principal: number, rate: number, interestType: InterestType,
  freq: Frequency, n: number, startDate: string,
): Installment[] {
  if (!principal || !n || n < 1) return [];
  const r = rate / 100;
  const schedule: Installment[] = [];
  const start = new Date(startDate + 'T00:00:00');

  if (interestType === 'flat') {
    const interestPerInstallment = principal * r;
    const principalPerInstallment = principal / n;
    const payment = principalPerInstallment + interestPerInstallment;
    for (let i = 1; i <= n; i++) {
      schedule.push({
        no: i,
        dueDate: toISODate(addPeriods(start, freq, i - 1)),
        interest: interestPerInstallment,
        principal: principalPerInstallment,
        payment,
        balance: i === n ? 0 : principal - principalPerInstallment * i,
      });
    }
  } else {
    const payment =
      r === 0
        ? principal / n
        : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    let balance = principal;
    for (let i = 1; i <= n; i++) {
      const interest = balance * r;
      const principalPortion = payment - interest;
      balance = Math.max(0, balance - principalPortion);
      schedule.push({
        no: i,
        dueDate: toISODate(addPeriods(start, freq, i - 1)),
        interest,
        principal: principalPortion,
        payment,
        balance: i === n ? 0 : balance,
      });
    }
  }
  return schedule;
}

interface Props {
  retailer: LoanOfferTarget;
  wholesaler: WholesalerInfo;
  onClose: () => void;
}

export default function LoanOfferModal({ retailer, wholesaler, onClose }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [interestType, setInterestType] = useState<InterestType>('flat');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [installments, setInstallments] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toISODate(d);
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);

  const parsedPrincipal = parseFloat(principal) || 0;
  const parsedRate = parseFloat(rate) || 0;
  const parsedInstallments = parseInt(installments) || 0;

  const schedule = useMemo(
    () => buildSchedule(parsedPrincipal, parsedRate, interestType, frequency, parsedInstallments, startDate),
    [parsedPrincipal, parsedRate, interestType, frequency, parsedInstallments, startDate],
  );

  const totalRepayable = schedule.reduce((s, i) => s + i.payment, 0);
  const totalInterest = schedule.reduce((s, i) => s + i.interest, 0);

  const formValid = parsedPrincipal > 0 && parsedInstallments >= 1 && parsedInstallments <= 120 && !!startDate;
  const exceedsLimit = !!(retailer.creditLimit && parsedPrincipal > retailer.creditLimit);
  const s = scoreStyle(retailer.score);
  const barColor = getScoreBar(retailer.score);

  const handleSubmit = async () => {
    if (!formValid || schedule.length === 0) return;
    setSubmitStatus('loading');
    setSubmitError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated. Please sign in again.');

      const offerData = {
        wholesalerUid: wholesaler.uid,
        wholesalerName: wholesaler.name,
        wholesalerEmail: wholesaler.email,
        retailerUid: retailer.retailerUid,
        retailerName: retailer.retailerName,
        retailerEmail: retailer.retailerEmail,
        reportId: retailer.id,
        creditLimit: retailer.creditLimit ?? null,
        principal: parsedPrincipal,
        interestRate: parsedRate,
        interestType,
        repaymentFrequency: frequency,
        installments: parsedInstallments,
        startDate,
        totalRepayable,
        totalInterest,
        schedule,
        status: 'pending_retailer_acceptance',
      };

      const res = await fetch('/api/loan-offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-Token': token,
        },
        body: JSON.stringify(offerData),
      });

      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);

      setStep('success');
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to send offer. Please try again.');
      setSubmitStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[95vh]">

        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button onClick={() => setStep('form')} className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Banknote size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Offer Credit</p>
              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{retailer.retailerName || retailer.retailerEmail}</p>
            </div>
          </div>
          {step !== 'success' && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">

          {step !== 'success' && (
            <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-4">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <svg width="44" height="44" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="17" fill="none" stroke="hsl(220 15% 18%)" strokeWidth="5" />
                  <circle cx="22" cy="22" r="17" fill="none" stroke={barColor} strokeWidth="5"
                    strokeDasharray={`${(retailer.score / 100) * (2 * Math.PI * 17)} ${2 * Math.PI * 17}`}
                    strokeLinecap="round" transform="rotate(-90 22 22)" />
                  <text x="22" y="26" textAnchor="middle" fill="white" fontSize="10" fontWeight="800">{retailer.score}</text>
                </svg>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.text} ${s.bg} ${s.border}`}>{retailer.grade}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{retailer.label}</p>
                {retailer.creditLimit != null && retailer.creditLimit > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-2.5 py-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested limit</p>
                    <p className="text-sm font-bold text-primary">KES {retailer.creditLimit.toLocaleString()}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'form' && (
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Principal amount (KES)</label>
                <input type="number" min="1" value={principal} onChange={e => setPrincipal(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                {exceedsLimit && (
                  <p className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertCircle size={11} /> Exceeds suggested limit of KES {retailer.creditLimit?.toLocaleString()}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Interest rate (% per installment)</label>
                  <input type="number" min="0" step="0.1" value={rate} onChange={e => setRate(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Interest type</label>
                  <div className="flex rounded-lg border border-input overflow-hidden h-[42px]">
                    {(['flat', 'reducing'] as const).map(t => (
                      <button key={t} onClick={() => setInterestType(t)}
                        className={`flex-1 text-xs font-medium transition-colors ${interestType === t ? 'bg-amber-500 text-black' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                        {t === 'flat' ? 'Flat' : 'Reducing'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Repayment frequency</label>
                  <div className="relative">
                    <select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}
                      className="w-full appearance-none px-3 py-2.5 pr-8 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">No. of installments</label>
                  <input type="number" min="1" max="120" value={installments} onChange={e => setInstallments(e.target.value)}
                    placeholder="e.g. 12"
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Repayment start date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  min={toISODate(new Date())}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              {schedule.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                  <div className="divide-y divide-border">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Per installment</span>
                      <span className="font-semibold text-sm text-foreground">{kes(schedule[0].payment)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Total interest</span>
                      <span className="font-semibold text-sm text-amber-400">{kes(totalInterest)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20">
                      <span className="text-xs font-semibold text-foreground">Total repayable</span>
                      <span className="font-bold text-sm text-foreground">{kes(totalRepayable)}</span>
                    </div>
                  </div>
                  <button onClick={() => setShowSchedule(v => !v)}
                    className="w-full text-xs text-primary hover:text-primary/80 py-2.5 px-4 flex items-center gap-1.5 border-t border-border transition-colors">
                    <ChevronDown size={12} className={`transition-transform ${showSchedule ? 'rotate-180' : ''}`} />
                    {showSchedule ? 'Hide' : 'Preview'} repayment schedule
                  </button>
                  {showSchedule && (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-muted/40 text-muted-foreground">
                            {['#', 'Due date', 'Interest', 'Principal', 'Payment', 'Balance'].map((h, i) => (
                              <th key={h} className={`px-3 py-1.5 font-medium ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.map(ins => (
                            <tr key={ins.no} className="border-t border-border/60">
                              <td className="px-3 py-1.5 text-muted-foreground">{ins.no}</td>
                              <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(ins.dueDate)}</td>
                              <td className="px-3 py-1.5 text-right text-amber-400">{kes(ins.interest)}</td>
                              <td className="px-3 py-1.5 text-right">{kes(ins.principal)}</td>
                              <td className="px-3 py-1.5 text-right font-semibold">{kes(ins.payment)}</td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground">{kes(ins.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => { if (formValid && schedule.length > 0) setStep('preview'); }}
                disabled={!formValid || schedule.length === 0}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Review Offer
              </button>
            </div>
          )}

          {step === 'preview' && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">Review before sending to the retailer.</p>
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {[
                  ['Principal', kes(parsedPrincipal)],
                  ['Interest rate', `${parsedRate}% per installment (${interestType})`],
                  ['Frequency', FREQ_LABELS[frequency]],
                  ['Installments', `${parsedInstallments}`],
                  ['First payment', formatDate(startDate)],
                  ['Last payment', schedule.length > 0 ? formatDate(schedule[schedule.length - 1].dueDate) : '—'],
                  ['Per installment', schedule.length > 0 ? kes(schedule[0].payment) : '—'],
                  ['Total interest', kes(totalInterest)],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{val}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                  <span className="font-semibold text-foreground">Total repayable</span>
                  <span className="font-bold text-lg text-foreground">{kes(totalRepayable)}</span>
                </div>
              </div>

              {submitError && (
                <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              <button onClick={handleSubmit} disabled={submitStatus === 'loading'}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {submitStatus === 'loading'
                  ? <><Loader2 size={14} className="animate-spin" /> Sending offer…</>
                  : 'Send Offer to Retailer'}
              </button>
            </div>
          )}

          {step === 'success' && (
            <div className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 size={30} className="text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Offer Sent!</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Your credit offer of <span className="font-semibold text-foreground">{kes(parsedPrincipal)}</span> has been sent to{' '}
                  <span className="font-semibold text-foreground">{retailer.retailerName || retailer.retailerEmail}</span>.
                  They will be notified in real time.
                </p>
              </div>
              <button onClick={onClose}
                className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-colors">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
