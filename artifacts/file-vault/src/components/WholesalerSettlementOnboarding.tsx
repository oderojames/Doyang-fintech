import { useState } from 'react';
import { CreditCard, Loader2, CheckCircle2, AlertCircle, ArrowLeft, ChevronDown, Landmark, Smartphone } from 'lucide-react';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

// Bank codes are Paystack's own internal codes for Kenya (fetched from /bank?country=kenya).
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
  { name: "M-Oriental Bank Ltd",                              code: "14"  },
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

type Step = 'method' | 'bank' | 'account' | 'phone' | 'confirm' | 'success';
type Method = 'bank' | 'mobile_wallet';

interface Props {
  onComplete: () => void;
  fullscreen?: boolean;
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.length === 9) return '254' + digits;
  return digits;
}

export default function WholesalerSettlementOnboarding({ onComplete, fullscreen = false }: Props) {
  const { user, markSettlementConnected } = useAuth();

  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<Method | null>(null);

  const [selectedBank, setSelectedBank] = useState<typeof KENYA_BANKS[number] | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const [phone, setPhone] = useState('');

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [skipLoading, setSkipLoading] = useState(false);

  const handleBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const bank = KENYA_BANKS.find(b => b.code === e.target.value) ?? null;
    setSelectedBank(bank);
  };

  const handleChooseMethod = (m: Method) => {
    setMethod(m);
    setStep(m === 'bank' ? 'bank' : 'phone');
  };

  const handleContinueToAccount = () => {
    if (!selectedBank) return;
    setAccountNumber('');
    setStep('account');
  };

  const handleContinueToConfirm = () => {
    if (accountNumber.trim().length < 5) return;
    setStep('confirm');
  };

  const handleContinueFromPhone = () => {
    const normalised = normalisePhone(phone);
    if (normalised.length !== 12) return;
    setStep('confirm');
  };

  const handleFinish = async () => {
    if (!user) return;
    setSubmitStatus('loading');
    setSubmitError('');

    try {
      if (method === 'bank') {
        if (!selectedBank) return;
        await updateDoc(doc(db, 'users', user.uid), {
          settlementMethod: 'bank',
          settlementConnected: true,
          settlementOnboardingDone: true,
          settlementBank: selectedBank.name,
          settlementBankCode: selectedBank.code,
          settlementAccountNumber: accountNumber.trim(),
          settlementAccountName: accountName || '',
          settlementPhone: null,
        });
      } else {
        const normalised = normalisePhone(phone);
        await updateDoc(doc(db, 'users', user.uid), {
          settlementMethod: 'mobile_wallet',
          settlementConnected: true,
          settlementOnboardingDone: true,
          settlementPhone: normalised,
          settlementBank: '',
          settlementBankCode: '',
          settlementAccountNumber: '',
          settlementAccountName: '',
        });
      }
    } catch {
      setSubmitError('Could not save your details. Check your internet connection and try again.');
      setSubmitStatus('error');
      return;
    }

    markSettlementConnected();
    setStep('success');
    setTimeout(() => onComplete(), 2200);
  };

  const handleSkip = async () => {
    if (!user) return;
    setSkipLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        settlementOnboardingDone: true,
        settlementConnected: false,
      }).catch(() => {});
      setDoc(doc(db, 'users', user.uid, 'notifications', 'settlement-required'), {
        id: 'settlement-required',
        type: 'settlement_required',
        title: 'Complete your settlement setup',
        body: 'Add your bank account or mobile wallet so Doyang can settle loan repayments to you.',
        createdAt: new Date().toISOString(),
        read: false,
      }).catch(() => {});
    } finally {
      setSkipLoading(false);
      onComplete();
    }
  };

  const steps: Step[] = method === 'mobile_wallet' ? ['method', 'phone', 'confirm'] : ['method', 'bank', 'account', 'confirm'];
  const stepIdx = steps.indexOf(step);

  const wrapper = fullscreen
    ? 'min-h-screen w-full bg-background flex items-center justify-center p-4'
    : 'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4';

  return (
    <div className={wrapper}>
      {fullscreen && (
        <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
      )}

      <div className="relative w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 mb-3">
            <CreditCard size={26} className="text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Settlement Setup</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose how you want to receive loan repayment settlements.
          </p>
        </div>

        {/* Progress */}
        {step !== 'success' && (
          <div className="flex gap-1.5 mb-6 px-1">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIdx ? 'bg-amber-500' : 'bg-border'}`}
              />
            ))}
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">

          {/* ── STEP: Method Selection ── */}
          {step === 'method' && (
            <div className="p-6 space-y-5">
              <div>
                <h3 className="font-semibold text-foreground">Choose settlement method</h3>
                <p className="text-xs text-muted-foreground mt-0.5">How should Doyang pay you?</p>
              </div>

              <button
                onClick={() => handleChooseMethod('bank')}
                className="w-full flex items-center gap-3 rounded-xl border border-border hover:border-amber-500/50 hover:bg-amber-500/5 px-4 py-3.5 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Landmark size={16} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Bank Account</p>
                  <p className="text-xs text-muted-foreground">Settle directly to your bank</p>
                </div>
              </button>

              <button
                onClick={() => handleChooseMethod('mobile_wallet')}
                className="w-full flex items-center gap-3 rounded-xl border border-border hover:border-amber-500/50 hover:bg-amber-500/5 px-4 py-3.5 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Smartphone size={16} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Mobile Wallet</p>
                  <p className="text-xs text-muted-foreground">M-Pesa, Airtel Money, or Telkom</p>
                </div>
              </button>

              <button
                onClick={handleSkip}
                disabled={skipLoading}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 flex items-center justify-center gap-1.5"
              >
                {skipLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                Skip for now — I'll complete this later
              </button>
            </div>
          )}

          {/* ── STEP: Bank Selection ── */}
          {step === 'bank' && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2.5">
                <button onClick={() => setStep('method')} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h3 className="font-semibold text-foreground">Select your bank</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Choose the bank where you want settlements sent</p>
                </div>
              </div>

              <div className="relative">
                <select
                  value={selectedBank?.code ?? ''}
                  onChange={handleBankChange}
                  className="w-full appearance-none px-4 py-3 pr-10 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  <option value="" disabled>— Choose a bank —</option>
                  {KENYA_BANKS.map(b => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>

              {selectedBank && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-0.5">Selected bank</p>
                  <p className="font-semibold text-amber-400">{selectedBank.name}</p>
                </div>
              )}

              <button
                onClick={handleContinueToAccount}
                disabled={!selectedBank}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>

              <button
                onClick={handleSkip}
                disabled={skipLoading}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1 flex items-center justify-center gap-1.5"
              >
                {skipLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                Skip for now — I'll complete this later
              </button>
            </div>
          )}

          {/* ── STEP: Account Number ── */}
          {step === 'account' && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2.5">
                <button onClick={() => setStep('bank')} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h3 className="font-semibold text-foreground">Enter account number</h3>
                  <p className="text-xs text-muted-foreground">{selectedBank?.name}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Account number</label>
                <input
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter your account number"
                  maxLength={20}
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono tracking-wider"
                />
              </div>

              <button
                onClick={handleContinueToConfirm}
                disabled={accountNumber.trim().length < 5}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>

              <button
                onClick={handleSkip}
                disabled={skipLoading}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── STEP: Phone Number (Mobile Wallet) ── */}
          {step === 'phone' && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2.5">
                <button onClick={() => setStep('method')} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h3 className="font-semibold text-foreground">Enter mobile number</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">M-Pesa, Airtel Money, or Telkom number</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Phone number</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">+254</span>
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="712345678"
                    maxLength={12}
                    autoFocus
                    className="w-full pl-14 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono tracking-wider"
                  />
                </div>
              </div>

              <button
                onClick={handleContinueFromPhone}
                disabled={normalisePhone(phone).length !== 12}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>

              <button
                onClick={handleSkip}
                disabled={skipLoading}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── STEP: Confirm ── */}
          {step === 'confirm' && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2.5">
                <button onClick={() => setStep(method === 'bank' ? 'account' : 'phone')} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h3 className="font-semibold text-foreground">Confirm details</h3>
                  <p className="text-xs text-muted-foreground">Review before saving your settlement account</p>
                </div>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border text-sm overflow-hidden">
                {method === 'bank' ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-muted-foreground">Bank</span>
                      <span className="font-medium text-foreground text-right max-w-[55%] leading-snug">{selectedBank?.name}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-muted-foreground">Account number</span>
                      <span className="font-mono font-medium text-foreground">{accountNumber}</span>
                    </div>
                    {accountName && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-muted-foreground">Account name</span>
                        <span className="font-medium text-foreground">{accountName}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-muted-foreground">Mobile number</span>
                    <span className="font-mono font-medium text-foreground">+{normalisePhone(phone)}</span>
                  </div>
                )}
              </div>

              {submitError && (
                <div className="flex items-start gap-2 text-destructive text-sm px-3 py-2.5">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              <button
                onClick={handleFinish}
                disabled={submitStatus === 'loading'}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitStatus === 'loading'
                  ? <><Loader2 size={14} className="animate-spin" />Saving…</>
                  : 'Save Settlement Details'}
              </button>

              <button
                onClick={handleSkip}
                disabled={skipLoading}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 size={30} className="text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">All set!</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {method === 'bank'
                    ? <>Your settlement account at <span className="font-semibold text-foreground">{selectedBank?.name}</span> is connected.</>
                    : <>Your mobile wallet <span className="font-semibold text-foreground">+{normalisePhone(phone)}</span> is connected.</>
                  } Repayments will be settled directly to you.
                </p>
              </div>
              <Loader2 size={16} className="text-muted-foreground animate-spin" />
            </div>
          )}
        </div>

        {step !== 'success' && (
          <p className="text-[11px] text-muted-foreground text-center mt-4 leading-relaxed">
            Details are sent securely to Paystack. Doyang never stores your account credentials.
          </p>
        )}
      </div>
    </div>
  );
}
