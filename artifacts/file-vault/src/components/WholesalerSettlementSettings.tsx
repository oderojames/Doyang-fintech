import { useState, useEffect } from 'react';
import {
  X, Landmark, AlertTriangle, CheckCircle2, Loader2,
  Pencil, TriangleAlert, ChevronLeft,
} from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

const KENYA_BANKS = [
  { name: "Absa Bank Kenya Plc",                              code: "03"  },
  { name: "Access Bank Kenya",                                code: "26"  },
  { name: "African BankingCorporation Ltd",                   code: "35"  },
  { name: "Bank of Africa Kenya Ltd",                         code: "19"  },
  { name: "Bank of Baroda Kenya Limited",                     code: "06"  },
  { name: "Bank of India",                                    code: "05"  },
  { name: "Caritas Microfinance Bank",                        code: "48"  },
  { name: "Choice Microfinance Bank",                         code: "82"  },
  { name: "Citibank NA",                                      code: "16"  },
  { name: "Co-operative Bank of Kenya Ltd",                   code: "11"  },
  { name: "Commercial International Bank",                    code: "65"  },
  { name: "Consolidated Bank of Kenya Ltd",                   code: "23"  },
  { name: "Credit Bank Limited",                              code: "25"  },
  { name: "Development Bank of Kenya Ltd",                    code: "59"  },
  { name: "Diamond Trust Bank Kenya Ltd",                     code: "63"  },
  { name: "Dubai Islamic Bank Ltd",                           code: "75"  },
  { name: "Ecobank Kenya Limited",                            code: "43"  },
  { name: "Equity Bank Kenya Ltd",                            code: "68"  },
  { name: "Family Bank Ltd",                                  code: "70"  },
  { name: "Faulu Microfinance Bank",                          code: "79"  },
  { name: "Guaranty Trust Bank Kenya",                        code: "53"  },
  { name: "Guardian Bank Ltd",                                code: "55"  },
  { name: "Gulf African Bank Ltd",                            code: "72"  },
  { name: "Habib Bank Limited",                               code: "17"  },
  { name: "Housing Finance Cooperation Kenya (HFC Bank)",     code: "61"  },
  { name: "I & M Bank Kenya Ltd",                             code: "57"  },
  { name: "Kenya Commercial Bank (Kenya) Ltd",                code: "01"  },
  { name: "Kenya Women Microfinance Bank",                    code: "78"  },
  { name: "Kingdom Bank",                                     code: "51"  },
  { name: "M-Oriental Bank Ltd",                             code: "14"  },
  { name: "Middle East Bank Kenya Ltd",                       code: "18"  },
  { name: "National Bank of Kenya Ltd",                       code: "12"  },
  { name: "NCBA Bank Kenya",                                  code: "07"  },
  { name: "NCBA Loop",                                        code: "138" },
  { name: "Paramount Universal Bank Ltd",                     code: "50"  },
  { name: "PostBank Kenya",                                   code: "62"  },
  { name: "Premier Bank Kenya",                               code: "74"  },
  { name: "Prime Bank Limited",                               code: "10"  },
  { name: "SBM Bank Kenya",                                   code: "60"  },
  { name: "Sidian Bank Kenya",                                code: "66"  },
  { name: "Spire Bank Kenya",                                 code: "49"  },
  { name: "Stanbic Bank Kenya Limited",                       code: "31"  },
  { name: "Standard Chartered Bank Kenya",                    code: "02"  },
  { name: "Stima Sacco",                                      code: "89"  },
  { name: "UBA Kenya Bank Ltd",                               code: "76"  },
  { name: "UMBA Microfinance Bank",                           code: "67"  },
  { name: "Unaitas Sacco",                                    code: "32"  },
  { name: "Victoria Commercial Bank Ltd",                     code: "54"  },
  { name: "Vooma",                                            code: "93"  },
] as const;

interface SettlementDetails {
  bank: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

interface Props {
  onClose: () => void;
}

type View = 'overview' | 'edit';

export default function WholesalerSettlementSettings({ onClose }: Props) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<SettlementDetails | null>(null);
  const [activeLoansCount, setActiveLoansCount] = useState(0);
  const [checkError, setCheckError] = useState('');

  const [view, setView] = useState<View>('overview');

  const [selectedBank, setSelectedBank] = useState<typeof KENYA_BANKS[number] | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setCheckError('');
      try {
        const snap = await getDoc(doc(db, 'users', user!.uid));
        const d = snap.data() ?? {};
        if (!cancelled) {
          setDetails({
            bank: (d.settlementBank as string) ?? '',
            bankCode: (d.settlementBankCode as string) ?? '',
            accountNumber: (d.settlementAccountNumber as string) ?? '',
            accountName: (d.settlementAccountName as string) ?? '',
          });
        }

        const token = await auth.currentUser?.getIdToken();
        if (!token || cancelled) return;
        const res = await fetch(`/api/loan-offers?wholesalerUid=${user!.uid}`, {
          headers: { 'X-Firebase-Token': token },
        });
        if (!res.ok) return;
        const json = await res.json() as { success: boolean; offers: { status: string }[] };
        if (json.success && !cancelled) {
          const active = json.offers.filter(o => o.status === 'active').length;
          setActiveLoansCount(active);
        }
      } catch {
        if (!cancelled) setCheckError('Could not load settlement details. Check your connection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const openEdit = () => {
    const bank = KENYA_BANKS.find(b => b.code === details?.bankCode) ?? null;
    setSelectedBank(bank);
    setAccountNumber(details?.accountNumber ?? '');
    setAccountName(details?.accountName ?? '');
    setSaveError('');
    setSaved(false);
    setView('edit');
  };

  const handleSave = async () => {
    if (!user?.uid || !selectedBank) return;
    if (accountNumber.trim().length < 5) { setSaveError('Enter a valid account number.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        settlementBank: selectedBank.name,
        settlementBankCode: selectedBank.code,
        settlementAccountNumber: accountNumber.trim(),
        settlementAccountName: accountName.trim(),
        paystackSubaccountCode: null,
      });
      setDetails({
        bank: selectedBank.name,
        bankCode: selectedBank.code,
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); setView('overview'); }, 1800);
    } catch {
      setSaveError('Could not save. Check your internet connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasDetails = details && (details.bank || details.accountNumber);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="fixed inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.6)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.6)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3.5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5">
          {view === 'edit' ? (
            <button onClick={() => setView('overview')} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={17} />
            </button>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Landmark size={13} className="text-amber-400" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-foreground leading-none">
              {view === 'edit' ? 'Change Bank Account' : 'Settlement Account'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {view === 'edit' ? 'Update your payout details' : 'Where loan repayments are settled'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-sm">Loading your settlement details…</span>
          </div>
        )}

        {!loading && checkError && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{checkError}</span>
          </div>
        )}

        {/* ── Overview ── */}
        {!loading && !checkError && view === 'overview' && (
          <div className="space-y-4">

            {/* Current details card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Settlement Account</p>
              </div>

              {hasDetails ? (
                <div className="px-4 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Landmark size={15} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{details!.bank || '—'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Bank</p>
                    </div>
                  </div>

                  <div className="h-px bg-border/60" />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">Account Number</p>
                      <p className="text-sm font-semibold text-foreground font-mono tracking-wider">
                        {details!.accountNumber
                          ? `${'•'.repeat(Math.max(0, details!.accountNumber.length - 4))}${details!.accountNumber.slice(-4)}`
                          : '—'}
                      </p>
                    </div>
                    {details!.accountName && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">Account Name</p>
                        <p className="text-sm font-semibold text-foreground truncate">{details!.accountName}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6 text-center">
                  <Landmark size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No settlement account set up yet.</p>
                </div>
              )}
            </div>

            {/* Active loans warning — blocks editing */}
            {activeLoansCount > 0 && (
              <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-4">
                <TriangleAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-300 leading-snug">
                    Cannot change bank details
                  </p>
                  <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                    You have <span className="font-semibold">{activeLoansCount} active loan{activeLoansCount !== 1 ? 's' : ''}</span> in progress.
                    Changing your bank account while loans are active would break repayment settlements.
                    Wait until all loans are fully repaid, then update your details here.
                  </p>
                </div>
              </div>
            )}

            {/* No active loans — allow editing */}
            {activeLoansCount === 0 && (
              <button
                onClick={openEdit}
                className="w-full flex items-center justify-between gap-3 bg-card border border-border hover:border-amber-500/40 rounded-2xl px-4 py-3.5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-amber-500/15 transition-colors">
                    <Pencil size={13} className="text-muted-foreground group-hover:text-amber-400 transition-colors" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">
                      {hasDetails ? 'Change Bank Account' : 'Set Up Settlement Account'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hasDetails ? 'Update your payout bank details' : 'Add your bank account to receive payouts'}
                    </p>
                  </div>
                </div>
                <ChevronLeft size={14} className="text-muted-foreground rotate-180 shrink-0" />
              </button>
            )}

            <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed px-2">
              Settlement details are used to route repayments from retailers to your bank account.
            </p>
          </div>
        )}

        {/* ── Edit form ── */}
        {!loading && !checkError && view === 'edit' && (
          <div className="space-y-5">

            {/* Bank picker */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Bank
              </label>
              <div className="relative">
                <select
                  value={selectedBank?.code ?? ''}
                  onChange={e => {
                    const b = KENYA_BANKS.find(b => b.code === e.target.value) ?? null;
                    setSelectedBank(b);
                  }}
                  className="w-full appearance-none bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 pr-8"
                >
                  <option value="">Select your bank</option>
                  {KENYA_BANKS.map(b => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Account number */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Account Number
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 0123456789"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            {/* Account name (optional) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Account Name <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Name on the account"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            {saveError && (
              <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                <AlertTriangle size={13} className="shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {saved && (
              <div className="flex items-center gap-2 text-green-400 text-xs bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                <CheckCircle2 size={13} className="shrink-0" />
                <span>Bank account updated successfully.</span>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving || saved || !selectedBank || accountNumber.trim().length < 5}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : saved
                ? <><CheckCircle2 size={14} /> Saved</>
                : 'Save Bank Account'}
            </button>

            <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
              Your previous Paystack settlement link will be reset. A new one will be created automatically when the next loan is activated.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
