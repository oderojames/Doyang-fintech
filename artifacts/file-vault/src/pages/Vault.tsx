import { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Lock, Trash2, UploadCloud, ShieldAlert, TrendingUp, Calendar,
  BarChart3, AlertCircle, CheckCircle2, MinusCircle, FileText,
  ShieldCheck, BadgeAlert, ThumbsUp, ThumbsDown, Minus,
  ArrowDownLeft, ArrowUpRight, Lightbulb, AlertTriangle, XCircle,
  Banknote, Phone, CreditCard, RefreshCw, ShoppingBag, Building2,
  LogOut, Menu, X, Globe, Settings, Smartphone, Users2, Share2, Loader2, Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  collection, doc, getDocs, setDoc, deleteDoc, updateDoc, getDoc,
  query, orderBy, where, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import VisibilityOnboarding from '@/pages/VisibilityOnboarding';
import ReportShareModal from '@/components/ReportShareModal';
import NotificationCenter from '@/components/NotificationCenter';
import ConnectCardBanner from '@/components/ConnectCardBanner';
import RetailerCardSettings from '@/components/RetailerCardSettings';
import { SellerModeGateDialog, SellerModeView, SellerModeBlankView, SellerCardRequiredDialog, CardConnectedSuccessDialog } from '@/components/SellerMode';


pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface DailyIncome { date: string; amount: number; transactionCount: number; }
interface MonthlyIncome { month: string; label: string; amount: number; transactionCount: number; }
interface TrustFactor { name: string; score: number; weight: number; impact: 'positive' | 'negative' | 'neutral'; detail: string; }

interface TrustScore {
  score: number; grade: string; label: string; creditLimit: number;
  reasoning: string; factors: TrustFactor[];
  riskLevel: string; recommendation: string;
}

interface Summary {
  totalIncome: number; totalExpenditure: number; netCashFlow: number; cashFlowRatio: number;
  averageMonthlyIncome: number; averageDailyIncome: number;
  peakIncomeMonth: string; lowestIncomeMonth: string; currency: string;
  periodStart: string; periodEnd: string; totalTransactions: number;
  incomeTransactions: number; expenditureTransactions: number;
}

interface BehavioralInsight {
  type: 'positive' | 'negative' | 'warning';
  title: string;
  description: string;
}

interface RecentTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  category: string;
}

interface AnalysisResult {
  customerName?: string | null;
  customerPhone?: string | null;
  dailyIncome: DailyIncome[]; monthlyIncome: MonthlyIncome[];
  trustScore: TrustScore; summary: Summary;
  behavioralInsights?: BehavioralInsight[];
  recentTransactions?: RecentTransaction[];
  sellerVerified?: boolean;
}

interface StoredAnalysis {
  id: string;
  name: string;
  size: number;
  dateAdded: string;
  result: AnalysisResult;
  retailerUid?: string;
  retailerName?: string;
  retailerEmail?: string;
  customerName?: string;
  customerPhone?: string;
}

function fmt(n: number, currency = 'KES') {
  return `${currency} ${(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function gradeColor(grade: string) {
  if (grade === 'A') return '#22c55e';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  if (grade === 'D') return '#ef4444';
  return '#7c3aed'; // E — High Risk
}

function scoreColor(score: number) {
  if (score >= 85) return '#22c55e'; // Excellent
  if (score >= 70) return '#3b82f6'; // Good
  if (score >= 55) return '#f59e0b'; // Fair
  if (score >= 40) return '#ef4444'; // Review Required
  return '#7c3aed'; // High Risk
}

function CreditGauge({ score, grade, label }: { score: number; grade: string; label: string }) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 52;
  const dash = (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="148" height="148" viewBox="0 0 148 148">
        <circle cx="74" cy="74" r="52" fill="none" stroke="hsl(220 15% 18%)" strokeWidth="14" />
        <circle cx="74" cy="74" r="52" fill="none" stroke={color} strokeWidth="14"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
          transform="rotate(-90 74 74)" style={{ transition: 'stroke-dasharray 1.2s ease' }} />
        <text x="74" y="64" textAnchor="middle" fill="white" fontSize="30" fontWeight="800">{score}</text>
        <text x="74" y="82" textAnchor="middle" fill={color} fontSize="15" fontWeight="700">{grade}</text>
        <text x="74" y="97" textAnchor="middle" fill="#94a3b8" fontSize="10">{label}</text>
      </svg>
    </div>
  );
}

function FactorBar({ factor }: { factor: TrustFactor }) {
  const color = factor.impact === 'positive' ? '#22c55e' : factor.impact === 'negative' ? '#ef4444' : '#f59e0b';
  const Icon = factor.impact === 'positive' ? ThumbsUp : factor.impact === 'negative' ? ThumbsDown : Minus;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Icon size={11} style={{ color }} />
          <span className="font-medium text-foreground">{factor.name}</span>
          <span className="text-muted-foreground">({factor.weight}%)</span>
        </div>
        <span className="font-bold" style={{ color }}>{factor.score}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${factor.score}%`, background: color }} />
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{factor.detail}</p>
    </div>
  );
}

const CATEGORY_ICONS: Record<string, React.FC<{ size: number; className?: string }>> = {
  Income: TrendingUp, 'Bill Payment': Building2, Transfer: ArrowUpRight,
  Withdrawal: Banknote, Airtime: Phone, Loan: CreditCard,
  Business: ShoppingBag, Other: RefreshCw,
};

function InsightCard({ insight }: { insight: BehavioralInsight }) {
  const isPos = insight.type === 'positive';
  const isNeg = insight.type === 'negative';
  const Icon = isPos ? Lightbulb : isNeg ? XCircle : AlertTriangle;
  const colors = isPos
    ? { border: 'border-green-500/30', bg: 'bg-green-500/8', icon: 'text-green-400', title: 'text-green-300' }
    : isNeg
    ? { border: 'border-red-500/30', bg: 'bg-red-500/8', icon: 'text-red-400', title: 'text-red-300' }
    : { border: 'border-amber-500/30', bg: 'bg-amber-500/8', icon: 'text-amber-400', title: 'text-amber-300' };
  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${colors.border} ${colors.bg}`}>
      <Icon size={15} className={`mt-0.5 shrink-0 ${colors.icon}`} />
      <div>
        <p className={`text-xs font-semibold mb-0.5 ${colors.title}`}>{insight.title}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.description}</p>
      </div>
    </div>
  );
}

function TxRow({ tx, currency }: { tx: RecentTransaction; currency: string }) {
  const isCredit = tx.type === 'credit';
  const CatIcon = CATEGORY_ICONS[tx.category] ?? RefreshCw;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isCredit ? 'bg-green-500/15' : 'bg-red-500/12'}`}>
        {isCredit
          ? <ArrowDownLeft size={13} className="text-green-400" />
          : <ArrowUpRight size={13} className="text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{tx.description}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <CatIcon size={10} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{tx.category}</span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{tx.date}</span>
        </div>
      </div>
      <span className={`text-xs font-bold shrink-0 ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
        {isCredit ? '+' : '-'}{fmt(tx.amount, currency)}
      </span>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    Low: 'bg-green-500/15 text-green-400 border-green-500/30',
    Medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    High: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'Very High': 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${map[level] || map.High}`}>{level} Risk</span>;
}

function RecommendationBadge({ rec }: { rec: string }) {
  const isApprove = rec?.toLowerCase().startsWith('approve');
  const isDecline = rec?.toLowerCase().startsWith('decline');
  const cls = isApprove ? 'bg-green-500/15 text-green-400 border-green-500/30'
    : isDecline ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  const Icon = isApprove ? CheckCircle2 : isDecline ? AlertCircle : MinusCircle;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${cls}`}>
      <Icon size={15} /> {rec}
    </div>
  );
}

function userCol(uid: string) { return collection(db, 'users', uid, 'vault_analyses'); }
function userDoc(uid: string, id: string) { return doc(db, 'users', uid, 'vault_analyses', id); }
function sharedReportDoc(id: string) { return doc(db, 'retailer_reports', id); }

async function fsLoadAnalyses(uid: string): Promise<StoredAnalysis[]> {
  const snap = await getDocs(query(userCol(uid), orderBy('dateAdded', 'desc')));
  return snap.docs.map(d => d.data() as StoredAnalysis);
}

async function fsSaveAnalysis(
  uid: string,
  analysis: StoredAnalysis,
  visibility: 'public' | 'private' | 'sameBusiness' = 'public',
  allowedWholesalers: string[] = [],
  businessType = '',
): Promise<void> {
  await setDoc(userDoc(uid, analysis.id), analysis);
  // Write a summary to the shared top-level collection for wholesaler access.
  // This is best-effort — a failure here must NOT break the local save.
  await setDoc(sharedReportDoc(analysis.id), {
    id: analysis.id,
    retailerUid: uid,
    customerName: analysis.customerName ?? null,
    customerPhone: analysis.customerPhone ?? null,
    retailerName: analysis.retailerName ?? '',
    retailerEmail: analysis.retailerEmail ?? '',
    fileName: analysis.name,
    dateAdded: analysis.dateAdded,
    score: analysis.result.trustScore.score,
    grade: analysis.result.trustScore.grade,
    label: analysis.result.trustScore.label,
    creditLimit: analysis.result.trustScore.creditLimit ?? 0,
    sellerVerified: analysis.result.sellerVerified ?? false,
    periodStart: analysis.result.summary?.periodStart ?? null,
    periodEnd: analysis.result.summary?.periodEnd ?? null,
    visibility,
    allowedWholesalers: visibility === 'private' ? allowedWholesalers : [],
    businessType,
  }).catch((err) => {
    console.warn('[fsSaveAnalysis] shared report write failed (non-fatal):', err?.code ?? err?.message);
  });
}

async function fsDeleteAnalysis(uid: string, id: string): Promise<void> {
  await deleteDoc(userDoc(uid, id));
  await deleteDoc(sharedReportDoc(id)).catch(() => {});
}

async function fsUpdateRetailerVisibility(
  uid: string,
  visibility: 'public' | 'private' | 'sameBusiness',
  allowedWholesalers: string[],
  businessType = '',
): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'retailer_reports'), where('retailerUid', '==', uid))
  );
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    batch.update(d.ref, {
      visibility,
      allowedWholesalers: visibility === 'private' ? allowedWholesalers : [],
      businessType,
    });
  });
  await batch.commit();
}

export default function Vault() {
  const { user, signOut, deleteAccount, cardConnected } = useAuth();
  const uid = user!.uid;

  const [analyses, setAnalyses] = useState<StoredAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);

  const [pendingPdf, setPendingPdf] = useState<{ data: string; name: string; size: number } | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordCallback, setPasswordCallback] = useState<((pwd: string) => void) | null>(null);

  const [analyzing, setAnalyzing] = useState(false);

  const [paymentGate, setPaymentGate] = useState<File | null>(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentStep, setPaymentStep] = useState<'methodSelect' | 'phone' | 'initiating' | 'waiting' | 'error'>('methodSelect');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'sendmoney' | 'paybill' | 'tillnumber' | 'bankpaybill'>('sendmoney');
  const [paymentTxRef, setPaymentTxRef] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentCountdown, setPaymentCountdown] = useState(90);
  const paymentGateRef = useRef<File | null>(null);
  useEffect(() => { paymentGateRef.current = paymentGate; }, [paymentGate]);

  const pendingSellerRef = useRef(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visibilityPref, setVisibilityPref] = useState<'public' | 'private' | 'sameBusiness' | null | 'loading'>('loading');
  const [allowedWholesalers, setAllowedWholesalers] = useState<string[]>([]);
  const [businessType, setBusinessType] = useState('');
  const [showVisibilitySettings, setShowVisibilitySettings] = useState(false);
  const [showCardSettings, setShowCardSettings] = useState(false);
  const [showCardConnectedDialog, setShowCardConnectedDialog] = useState(false);
  const [reportShareModal, setReportShareModal] = useState<{
    reportId: string;
    reportName: string;
    initialOption: 'public' | 'private' | 'sameBusiness';
    initialSelected: string[];
  } | null>(null);
  const [reportShareLoading, setReportShareLoading] = useState<string | null>(null);

  const [sellerModeActive, setSellerModeActive] = useState(false);
  const [sellerLastStatementAt, setSellerLastStatementAt] = useState<string | null>(null);
  const [sellerTrustScore, setSellerTrustScore] = useState<{ score: number; grade: string; label: string } | null>(null);
  const [showSellerGate, setShowSellerGate] = useState<'never' | 'expired' | null>(null);
  const [showSellerView, setShowSellerView] = useState(false);
  const [showSellerCardDialog, setShowSellerCardDialog] = useState(false);

  const { toast } = useToast();
  const { addLocalNotification } = useNotifications();

  useEffect(() => {
    document.documentElement.classList.add('dark');
    Promise.all([
      fsLoadAnalyses(uid),
      getDoc(doc(db, 'users', uid)),
    ]).then(([analyses, userSnap]) => {
      setAnalyses(analyses);
      const data = userSnap.data();
      const pref = data?.visibilityPreference ?? null;
      setVisibilityPref(pref);
      setAllowedWholesalers(data?.allowedWholesalers ?? []);
      setBusinessType(data?.businessType ?? '');
      if (data?.sellerModeActive) {
        setSellerModeActive(true);
        setSellerLastStatementAt(data.sellerLastStatementAt ?? null);
        setSellerTrustScore(data.sellerTrustScore ?? null);
      }
      setLoadingAnalyses(false);
    }).catch(() => {
      setVisibilityPref(null);
      setLoadingAnalyses(false);
    });
  }, [uid]);

  const selectedAnalysis = analyses.find(a => a.id === selectedId) ?? null;
  const analysisResult = selectedAnalysis?.result ?? null;
  const currency = analysisResult?.summary?.currency || 'KES';
  const ts = analysisResult?.trustScore;
  const sm = analysisResult?.summary;

  const daysSinceLastStatement = sellerLastStatementAt
    ? (Date.now() - new Date(sellerLastStatementAt).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  const extractText = async (base64: string, password?: string): Promise<string> => {
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    const task = pdfjsLib.getDocument({ data: arr.buffer, password: password || '' });
    task.onPassword = (cb: (pwd: string) => void, reason: number) => {
      setPasswordRequired(true);
      setPasswordError(reason === 2 ? 'Incorrect password' : null);
      setPasswordCallback(() => cb);
    };
    const pdfDoc = await task.promise;
    setPasswordRequired(false); setPasswordError(null);

    let fullText = '';

    // Column X-positions detected from the header row (persist across pages)
    let paidInX   = -1;
    let withdrawnX = -1;
    let balanceX  = -1;
    const COL_TOLERANCE = 60; // PDF units — how close an amount must be to its column header

    // Helper: is a string a bare monetary amount (e.g. "1,234.56")?
    const isMoney = (s: string) => /^\d{1,3}(,\d{3})*\.\d{2}$/.test(s);

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();

      // ── Group items by Y position (round to nearest 4 units to handle slight offsets)
      const rowMap = new Map<number, Array<{ x: number; str: string }>>();
      for (const item of content.items as any[]) {
        const str: string = (item.str ?? '').trim();
        if (!str) continue;
        const y = Math.round(item.transform[5] / 4) * 4;
        if (!rowMap.has(y)) rowMap.set(y, []);
        rowMap.get(y)!.push({ x: item.transform[4], str });
      }

      // Sort rows top-to-bottom (PDF Y increases bottom-up, so descending = top first)
      const sortedY = [...rowMap.keys()].sort((a, b) => b - a);

      for (const y of sortedY) {
        const items = rowMap.get(y)!.sort((a, b) => a.x - b.x);
        const rowText = items.map(it => it.str).join(' ');

        // ── Detect the M-Pesa table header to capture column X positions ──────
        if (/paid.?in/i.test(rowText) && /withdrawn/i.test(rowText)) {
          for (const it of items) {
            if (/paid.?in/i.test(it.str))  paidInX    = it.x;
            if (/withdrawn/i.test(it.str)) withdrawnX = it.x;
            if (/balance/i.test(it.str))   balanceX   = it.x;
          }
          // Emit the header as a skip marker so the backend ignores it
          fullText += '##HEADER##\n';
          continue;
        }

        // ── If column positions are known, tag amounts by column ──────────────
        if (paidInX >= 0 && withdrawnX >= 0) {
          const textParts: string[] = [];
          let paidIn   = 0;
          let withdrawn = 0;
          let balance  = 0;

          for (const it of items) {
            if (isMoney(it.str)) {
              const val = parseFloat(it.str.replace(/,/g, ''));
              const dPaid = Math.abs(it.x - paidInX);
              const dWith = Math.abs(it.x - withdrawnX);
              const dBal  = balanceX >= 0 ? Math.abs(it.x - balanceX) : Infinity;
              const minD  = Math.min(dPaid, dWith, dBal);

              if (minD > COL_TOLERANCE) {
                // Amount far from all known columns → treat as description context
                textParts.push(it.str);
              } else if (minD === dBal) {
                balance = val;
              } else if (minD === dWith) {
                withdrawn = val;
              } else {
                paidIn = val;
              }
            } else {
              textParts.push(it.str);
            }
          }

          // Emit tagged row — backend reads |PAIDIN=|WITHDRAWN=|BALANCE= directly
          let row = textParts.join(' ');
          if (paidIn   > 0) row += ` |PAIDIN=${paidIn}`;
          if (withdrawn > 0) row += ` |WITHDRAWN=${withdrawn}`;
          if (balance   > 0) row += ` |BALANCE=${balance}`;
          fullText += row + '\n';
        } else {
          // No header detected yet — emit plain row (pre-header content / other PDFs)
          fullText += items.map(it => it.str).join(' ') + '\n';
        }
      }

      fullText += '\n'; // page separator
    }

    return fullText;
  };

  const analyzeAndSave = async (pdfData: string, fileName: string, fileSize: number, password?: string) => {
    setAnalyzing(true); setAnalysisError(null);
    try {
      const text = await extractText(pdfData, password);
      const res = await fetch('/api/analyze/mpesa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, paymentMethod: selectedPaymentMethod, uid }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(e.error || `Error ${res.status}`);
      }
      const result: AnalysisResult = await res.json();
      const entry: StoredAnalysis = {
        id: crypto.randomUUID(),
        name: fileName,
        size: fileSize,
        dateAdded: new Date().toISOString(),
        result,
        retailerUid: uid,
        customerName: result.customerName || undefined,
        customerPhone: result.customerPhone || undefined,
        retailerName: user?.displayName || user?.email?.split('@')[0] || 'Retailer',
        retailerEmail: user?.email || '',
      };
      await fsSaveAnalysis(
        uid, entry,
        visibilityPref === 'private' ? 'private' : visibilityPref === 'sameBusiness' ? 'sameBusiness' : 'public',
        allowedWholesalers,
        businessType,
      );
      setAnalyses(prev => [entry, ...prev]);
      setSelectedId(entry.id);
      setPendingPdf(null);

      if (pendingSellerRef.current) {
        pendingSellerRef.current = false;
        if (result.sellerVerified) {
          const now = new Date().toISOString();
          const newScore = {
            score: result.trustScore.score,
            grade: result.trustScore.grade,
            label: result.trustScore.label,
          };
          setSellerModeActive(true);
          setSellerLastStatementAt(now);
          setSellerTrustScore(newScore);
          setShowSellerGate(null);
          setShowSellerView(true);
          addLocalNotification({
            id: 'seller-verification',
            type: 'seller_verification',
            title: 'Seller Verification Successful',
            body: 'Your Seller Profile has been verified successfully. Your latest Trust Score is now visible to buyers.',
            sellerVerified: true,
          });
        } else {
          addLocalNotification({
            id: 'seller-verification',
            type: 'seller_verification',
            title: 'Seller Verification Failed',
            body: "We couldn't verify your Seller Profile. Please upload the latest M-PESA statement so as to get your current data.",
            sellerVerified: false,
          });
        }
      }
    } catch (e: any) {
      pendingSellerRef.current = false;
      if (e.name === 'PasswordException') {
        setPasswordRequired(true);
        setPasswordError(e.code === 2 ? 'Incorrect password' : null);
      } else {
        setAnalysisError(e.message || 'Analysis failed');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPdf) return;
    if (passwordCallback) {
      setPasswordCallback(null);
      passwordCallback(passwordInput);
    } else {
      setPasswordRequired(false);
      analyzeAndSave(pendingPdf.data, pendingPdf.name, pendingPdf.size, passwordInput);
    }
  };

  const proceedAfterPayment = (file: File) => {
    setPaymentGate(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setSelectedId(null);
      setAnalysisError(null);
      setPasswordRequired(false);
      setPasswordInput('');
      setPendingPdf({ data: base64, name: file.name, size: file.size });
      analyzeAndSave(base64, file.name, file.size);
    };
    reader.readAsDataURL(file);
  };

  const initiatePayment = async () => {
    setPaymentStep('initiating');
    setPaymentError(null);
    try {
      const token = await import('@/lib/firebase').then(m => m.auth.currentUser?.getIdToken().catch(() => null) ?? null);
      const res = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ phone: paymentPhone, email: user?.email ?? 'payments@doyang.app' }),
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

  useEffect(() => {
    if (paymentStep !== 'waiting') return;
    const id = setInterval(() => {
      setPaymentCountdown(c => {
        if (c <= 1) {
          setPaymentStep('error');
          setPaymentError('Payment timed out. Please try again.');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paymentStep]);

  useEffect(() => {
    if (paymentStep !== 'waiting' || !paymentTxRef) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status/${paymentTxRef}`);
        const data = await res.json();
        if (data.success && data.data?.status === 'completed') {
          clearInterval(id);
          const file = paymentGateRef.current;
          if (file) { paymentGateRef.current = null; proceedAfterPayment(file); }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [paymentStep, paymentTxRef]);

  const handleFileAdd = useCallback((file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'Invalid file', description: 'Please upload a PDF.', variant: 'destructive' });
      return;
    }
    setPaymentGate(file);
    setPaymentPhone('');
    setSelectedPaymentMethod('sendmoney');
    setPaymentStep('methodSelect');
    setPaymentTxRef(null);
    setPaymentError(null);
    setPaymentCountdown(90);
  }, [toast]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData?.items || [])) {
      if (item.type === 'application/pdf') { const f = item.getAsFile(); if (f) handleFileAdd(f); }
    }
  }, [handleFileAdd]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const openPicker = () => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'application/pdf';
    i.onchange = (e: any) => { if (e.target.files?.[0]) handleFileAdd(e.target.files[0]); };
    i.click();
  };

  const handleSellerModeClick = () => {
    if (!sellerModeActive) {
      setShowSellerGate('never');
    } else if (daysSinceLastStatement > 30) {
      setShowSellerGate('expired');
    } else {
      setShowSellerView(true);
    }
  };

  const handleSellerUpload = async () => {
    setShowSellerGate(null);
    try {
      const res = await fetch(`/api/paystack/auth-check?uid=${encodeURIComponent(uid)}`);
      const data = await res.json() as { hasAuthorization?: boolean };
      if (!data.hasAuthorization) {
        setShowSellerCardDialog(true);
        return;
      }
    } catch {
      setShowSellerCardDialog(true);
      return;
    }
    pendingSellerRef.current = true;
    openPicker();
  };

  const handleSellerConnectCard = () => {
    setShowSellerCardDialog(false);
    setShowCardSettings(true);
  };

  const handleSellerSkipCard = () => {
    setShowSellerCardDialog(false);
    pendingSellerRef.current = true;
    openPicker();
  };

  const handleSellerRefresh = () => {
    setShowSellerView(false);
    setShowSellerGate('expired');
  };

  const formatSize = (b: number) => (b / 1024 / 1024).toFixed(2) + ' MB';
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  const openReportShare = async (e: React.MouseEvent, a: { id: string; name: string }) => {
    e.stopPropagation();
    setReportShareLoading(a.id);
    try {
      const snap = await getDoc(sharedReportDoc(a.id));
      const data = snap.exists() ? snap.data() : null;
      setReportShareModal({
        reportId: a.id,
        reportName: a.name,
        initialOption: (data?.visibility as 'public' | 'private' | 'sameBusiness') ?? visibilityPref ?? 'public',
        initialSelected: data?.allowedWholesalers ?? [],
      });
    } catch {
      setReportShareModal({
        reportId: a.id,
        reportName: a.name,
        initialOption: (visibilityPref as 'public' | 'private' | 'sameBusiness') ?? 'public',
        initialSelected: allowedWholesalers,
      });
    } finally {
      setReportShareLoading(null);
    }
  };

  const isUploading = pendingPdf !== null;

  const closeSidebar = () => setSidebarOpen(false);

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold tracking-widest text-xs text-foreground">CREDIT VAULT</h1>
            <p className="text-[10px] text-muted-foreground">M-Pesa Creditworthiness</p>
          </div>
          {/* Close button — mobile only */}
          <button onClick={closeSidebar} className="md:hidden text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-2.5 py-2">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-primary">
              {(user?.displayName || user?.email || 'R')[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-foreground truncate">
              {user?.displayName || user?.email?.split('@')[0] || 'Retailer'}
            </p>
            <p className="text-[9px] text-primary truncate">Retailer</p>
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <button
              onClick={() => { handleSellerModeClick(); closeSidebar(); }}
              title="Sell"
              className="h-9 px-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm border border-primary/40 shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              <span>Sell</span>
            </button>
            <a href="/buyer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm transition-colors">
              <span>Buy</span>
            </a>
            <NotificationCenter
              onContinueToSellerMode={() => setShowSellerView(true)}
              onSellerUpload={() => { pendingSellerRef.current = true; openPicker(); }}
            />
          </div>
          <button onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError(null); }} title="Delete account"
            className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
            <Trash2 size={13} />
          </button>
          <button onClick={signOut} title="Sign out"
            className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
            <LogOut size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {loadingAnalyses ? (
          <div className="text-center p-6 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading...</p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="text-center p-6 text-muted-foreground">
            <ShieldAlert className="mx-auto mb-3 opacity-20" size={28} />
            <p className="text-sm">No reports yet.</p>
            <p className="text-xs mt-1">Upload an M-Pesa PDF.</p>
          </div>
        ) : analyses.map(a => {
          const score = a.result.trustScore.score;
          const grade = a.result.trustScore.grade;
          const color = scoreColor(score);
          return (
            <div key={a.id} data-testid={`analysis-${a.id}`}
              onClick={() => { setSelectedId(a.id); setPendingPdf(null); setAnalysisError(null); closeSidebar(); }}
              className={`group flex items-center p-2.5 rounded-lg cursor-pointer transition-all ${selectedId === a.id ? 'bg-primary/15 border border-primary/30' : 'hover:bg-accent border border-transparent'}`}>
              <div className="mr-2.5 shrink-0 flex flex-col items-center justify-center w-8 h-8 rounded-full" style={{ background: color + '22', border: `1.5px solid ${color}55` }}>
                <span className="text-[10px] font-black leading-none" style={{ color }}>{grade}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{a.name}</div>
                <div className="text-[10px] text-muted-foreground">{formatDate(a.dateAdded)}</div>
              </div>
              <Button
                variant="ghost" size="icon"
                className="sm:opacity-0 sm:group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-primary shrink-0"
                onClick={e => openReportShare(e, a)}
                title="Report sharing settings"
                disabled={reportShareLoading === a.id}
              >
                {reportShareLoading === a.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Share2 size={12} />}
              </Button>
              <Button variant="ghost" size="icon" data-testid={`remove-${a.id}`}
                className="sm:opacity-0 sm:group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={async e => {
                  e.stopPropagation();
                  await fsDeleteAnalysis(uid, a.id);
                  setAnalyses(prev => prev.filter(x => x.id !== a.id));
                  if (selectedId === a.id) setSelectedId(null);
                }}>
                <Trash2 size={12} />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-border space-y-2">
        <Button className="w-full text-xs" variant="outline" onClick={() => { openPicker(); closeSidebar(); }} size="sm" data-testid="add-btn">
          Analyze Statement
        </Button>
        {/* Sharing settings button */}
        <button
          onClick={() => { setShowVisibilitySettings(true); closeSidebar(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted hover:border-primary/30 transition-all text-left group"
        >
          <Settings size={12} className="text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sharing Settings</p>
            <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5 flex items-center gap-1">
              {visibilityPref === 'public'
                ? <><Globe size={9} className="text-primary shrink-0" />Visible to all wholesalers</>
                : visibilityPref === 'sameBusiness'
                ? <><Users2 size={9} className="text-green-400 shrink-0" />Same business type only</>
                : visibilityPref === 'private'
                ? <><Building2 size={9} className="text-amber-400 shrink-0" />{allowedWholesalers.length} specific wholesaler{allowedWholesalers.length !== 1 ? 's' : ''}</>
                : 'Tap to configure…'}
            </p>
          </div>
        </button>

        {/* Payment card settings button */}
        <button
          onClick={() => { setShowCardSettings(true); closeSidebar(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted hover:border-primary/30 transition-all text-left group"
        >
          <CreditCard size={12} className="text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Payment Card</p>
            <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
              Manage your repayment card
            </p>
          </div>
        </button>

        {/* Seller Mode button */}
        <button
          onClick={() => { handleSellerModeClick(); closeSidebar(); }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left group ${
            sellerModeActive && daysSinceLastStatement <= 30
              ? 'border-green-500/40 bg-green-500/10 hover:bg-green-500/15 hover:border-green-500/60'
              : 'border-primary/30 bg-primary/10 hover:bg-primary/15 hover:border-primary/50'
          }`}
        >
          <Store
            size={12}
            className={`shrink-0 transition-colors ${sellerModeActive && daysSinceLastStatement <= 30 ? 'text-green-400' : 'text-primary'}`}
          />
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${sellerModeActive && daysSinceLastStatement <= 30 ? 'text-green-400' : 'text-primary'}`}>
              Seller Mode
            </p>
            <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
              {sellerModeActive
                ? daysSinceLastStatement <= 30
                  ? 'Active · View your seller profile'
                  : 'Statement expired · Tap to refresh'
                : 'Become a verified seller'}
            </p>
          </div>
          {sellerModeActive && daysSinceLastStatement <= 30 && (
            <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </button>
      </div>
    </>
  );

  return (<>
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">

      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar — slide-in drawer on mobile, static on desktop */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50
        w-72 md:w-64
        border-r border-border bg-card flex flex-col shrink-0
        transition-transform duration-250 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <SidebarContent />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile top bar */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground p-1">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-primary" />
            <span className="font-bold text-sm tracking-wide">CREDIT VAULT</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { handleSellerModeClick(); }}
              title="Sell"
              className="h-9 px-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm border border-primary/40 shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              <span>Sell</span>
            </button>
            <a href="/buyer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm transition-colors">
              <span>Buy</span>
            </a>
            <NotificationCenter
              onContinueToSellerMode={() => setShowSellerView(true)}
              onSellerUpload={() => { pendingSellerRef.current = true; openPicker(); }}
            />
            <button onClick={openPicker} className="text-primary hover:text-primary/80 p-1" title="Analyze new statement">
              <UploadCloud size={20} />
            </button>
          </div>
        </div>

        {/* Connect card banner — visible to all retailers who have not connected a card */}
        <ConnectCardBanner />

        {/* Visibility preference loading */}
        {visibilityPref === 'loading' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>

        /* First-time visibility onboarding (never set yet) */
        ) : (visibilityPref === null || showVisibilitySettings) ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {showVisibilitySettings && (
              <div className="px-4 sm:px-6 pt-4 shrink-0">
                <button
                  onClick={() => setShowVisibilitySettings(false)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Back to vault
                </button>
              </div>
            )}
            <VisibilityOnboarding
              uid={uid}
              isEditing={showVisibilitySettings}
              retailerBusinessType={businessType}
              initialOption={visibilityPref === 'public' || visibilityPref === 'private' || visibilityPref === 'sameBusiness' ? visibilityPref : undefined}
              initialSelected={allowedWholesalers}
              onComplete={async (pref, allowed) => {
                setVisibilityPref(pref);
                setAllowedWholesalers(allowed);
                setShowVisibilitySettings(false);
                await fsUpdateRetailerVisibility(uid, pref, allowed, businessType);
              }}
            />
          </div>

        ) : passwordRequired && pendingPdf ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-sm w-full bg-card border border-border rounded-2xl p-8 shadow-xl">
              <div className="flex justify-center mb-5 text-amber-400"><Lock size={44} /></div>
              <h2 className="text-xl font-semibold text-center mb-1">Statement is encrypted</h2>
              <p className="text-sm text-muted-foreground text-center mb-6">Enter the password to unlock "{pendingPdf.name}"</p>
              <form onSubmit={submitPassword} className="space-y-4">
                <Input type="password" placeholder="Enter password..." value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)} autoFocus data-testid="pwd-input" className="bg-background" />
                {passwordError && <p className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={13} />{passwordError}</p>}
                <Button type="submit" className="w-full" data-testid="unlock-btn">Unlock & Analyze</Button>
              </form>
            </div>
          </div>

        ) : analyzing ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-bold text-xl">Analyzing Statement</p>
              <p className="text-sm text-muted-foreground mt-2">Scanning transactions · Computing credit score · Assessing risk</p>
            </div>
          </div>

        ) : analysisError ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <AlertCircle className="mx-auto mb-4 text-destructive" size={48} />
              <h2 className="text-xl font-semibold mb-2">Analysis Failed</h2>
              <p className="text-muted-foreground text-sm mb-6">{analysisError}</p>
              <Button onClick={openPicker} variant="outline">Try Another File</Button>
            </div>
          </div>

        ) : !selectedId ? (
          <div className="flex-1 flex items-center justify-center p-8"
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) handleFileAdd(e.dataTransfer.files[0]); }}>
            <div data-testid="drop-zone"
              className={`max-w-lg w-full border-2 border-dashed rounded-2xl p-8 sm:p-16 text-center transition-all ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
              <UploadCloud className="mx-auto text-muted-foreground mb-4" size={40} />
              <h2 className="text-xl sm:text-2xl font-bold mb-2">Upload M-Pesa Statement</h2>
              <p className="text-sm text-muted-foreground mb-1">Analyzes your transactions and generates</p>
              <p className="text-sm font-semibold text-primary mb-6">a detailed creditworthiness report</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-6 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-green-500" /> Password-protected PDFs</span>
                <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-green-500" /> PDF never stored</span>
              </div>
              <Button onClick={openPicker} size="lg" className="w-full sm:w-auto" data-testid="browse-btn">Browse Files</Button>
              <p className="text-xs text-muted-foreground mt-4 hidden sm:block">Or drag & drop · Ctrl+V to paste</p>
            </div>
          </div>

        ) : analysisResult && ts && sm ? (
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold truncate">{selectedAnalysis?.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sm.periodStart} — {sm.periodEnd} · {sm.totalTransactions} transactions
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={openPicker} className="shrink-0 text-xs">Analyze New</Button>
            </div>

            {/* Credit score hero + recommendation */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <CreditGauge score={ts.score} grade={ts.grade} label={ts.label} />
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-bold">Credit Assessment</h3>
                      <RiskBadge level={ts.riskLevel} />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{ts.reasoning}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <RecommendationBadge rec={ts.recommendation} />
                    <div className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested Credit Limit</p>
                      <p className="text-base font-bold text-primary">{fmt(ts.creditLimit, currency)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="col-span-2 sm:col-span-1 bg-card border-2 rounded-xl p-4"
                style={{ borderColor: (sm.cashFlowRatio >= 1.5 ? '#22c55e' : sm.cashFlowRatio >= 1.0 ? '#f59e0b' : '#ef4444') + '60' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <BarChart3 size={13} className="text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cash Flow Ratio</span>
                </div>
                <div className="text-2xl font-black" style={{ color: sm.cashFlowRatio >= 1.5 ? '#22c55e' : sm.cashFlowRatio >= 1.0 ? '#f59e0b' : '#ef4444' }}>
                  {(sm.cashFlowRatio || 0).toFixed(2)}×
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {sm.cashFlowRatio >= 2.0 ? 'Strong surplus' : sm.cashFlowRatio >= 1.2 ? 'Healthy surplus' : sm.cashFlowRatio >= 1.0 ? 'Break-even' : 'Spending > earning'}
                </div>
              </div>
              {[
                { label: 'Total Income', value: fmt(sm.totalIncome, currency), icon: TrendingUp, color: 'text-green-400' },
                { label: 'Total Expenditure', value: fmt(sm.totalExpenditure, currency), icon: BadgeAlert, color: 'text-red-400' },
                { label: 'Net Cash Flow', value: fmt(sm.netCashFlow, currency), icon: MinusCircle, color: sm.netCashFlow >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Avg Monthly Income', value: fmt(sm.averageMonthlyIncome, currency), icon: Calendar, color: 'text-blue-400' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon size={13} className="text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                  </div>
                  <div className={`text-sm font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Credit score factors */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Credit Score Factors</h3>
                <div className="space-y-4">
                  {ts.factors.map((f, i) => <FactorBar key={i} factor={f} />)}
                </div>
              </div>

              {/* Behavioral Insights */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb size={14} className="text-amber-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Behavioral Insights</h3>
                </div>
                {analysisResult.behavioralInsights && analysisResult.behavioralInsights.length > 0 ? (
                  <div className="space-y-2.5">
                    {analysisResult.behavioralInsights.map((insight, i) => (
                      <InsightCard key={i} insight={insight} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No behavioral data available</p>
                )}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Transactions</h3>
                </div>
                {analysisResult.recentTransactions && analysisResult.recentTransactions.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{analysisResult.recentTransactions.length} shown</span>
                )}
              </div>
              {analysisResult.recentTransactions && analysisResult.recentTransactions.length > 0 ? (
                <div className="max-h-72 overflow-y-auto pr-1">
                  {analysisResult.recentTransactions.map((tx, i) => (
                    <TxRow key={i} tx={tx} currency={currency} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No transaction data available</p>
              )}
            </div>

          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>

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
            This will permanently delete your account, all your analyses, and all your shared reports. Enter your password to confirm.
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

    {/* ── M-Pesa Payment Gate ─────────────────────────────────────────── */}
    {paymentGate && (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-br from-green-900/40 to-emerald-900/20 border-b border-border p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
              <Smartphone size={20} className="text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">M-Pesa Payment</p>
              <p className="text-xs text-muted-foreground">KSh 50 per statement analysis</p>
            </div>
            <button
              onClick={() => setPaymentGate(null)}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Step: choose payment method */}
            {paymentStep === 'methodSelect' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  How do customers pay you? This filters which transactions count as business income.
                </p>
                <div className="space-y-2">
                  {([
                    { value: 'sendmoney' as const, icon: <Phone size={15} className="text-green-400" />, label: 'Send Money / Pochi la Biashara', desc: 'Customers send money directly to your M-Pesa' },
                    { value: 'paybill'   as const, icon: <CreditCard size={15} className="text-blue-400" />, label: 'M-Pesa PayBill', desc: 'Customers pay via your business PayBill number' },
                    { value: 'tillnumber' as const, icon: <ShoppingBag size={15} className="text-amber-400" />, label: 'Till Number (Buy Goods)', desc: 'Customers scan your Lipa na M-Pesa till' },
                    { value: 'bankpaybill' as const, icon: <Building2 size={15} className="text-purple-400" />, label: 'Bank PayBill', desc: 'Customers pay via your bank-linked PayBill' },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedPaymentMethod(opt.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${selectedPaymentMethod === opt.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-muted/30'}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedPaymentMethod === opt.value ? 'bg-primary/20 border border-primary/30' : 'bg-muted border border-border'}`}>
                        {opt.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground leading-tight">{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{opt.desc}</p>
                      </div>
                      {selectedPaymentMethod === opt.value && (
                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold"
                  onClick={() => setPaymentStep('phone')}
                >
                  Continue
                </Button>
              </div>
            )}

            {/* Step: enter phone */}
            {(paymentStep === 'phone' || paymentStep === 'initiating') && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                    Enter your Safaricom number to receive an M-Pesa STK push for{' '}
                    <span className="font-semibold text-foreground">KSh 50</span>.
                  </p>
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
                <Button
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold gap-2"
                  onClick={initiatePayment}
                  disabled={!paymentPhone.trim() || paymentStep === 'initiating'}
                >
                  {paymentStep === 'initiating' ? (
                    <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Sending STK Push…</>
                  ) : (
                    <>Pay KSh 50 via M-Pesa</>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Your phone will vibrate with a payment prompt.
                </p>
              </>
            )}

            {/* Step: waiting for payment */}
            {paymentStep === 'waiting' && (
              <>
                <div className="text-center py-2 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
                    <span className="w-6 h-6 border-3 border-green-500/30 border-t-green-400 rounded-full animate-spin" style={{ borderWidth: 3 }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">Check your phone</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter your M-Pesa PIN to pay <span className="font-semibold text-foreground">KSh 50</span>
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-3 py-2 inline-block">
                    <p className="text-xs text-muted-foreground">
                      Expires in <span className="font-mono font-semibold text-foreground">
                        {Math.floor(paymentCountdown / 60)}:{String(paymentCountdown % 60).padStart(2, '0')}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  We'll detect your payment automatically. This may take a few seconds after you pay.
                </p>
                <button
                  onClick={() => setPaymentGate(null)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  Cancel
                </button>
              </>
            )}

            {/* Step: error */}
            {paymentStep === 'error' && (
              <>
                <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive leading-snug">{paymentError || 'Payment failed. Please try again.'}</p>
                </div>
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => { setPaymentStep('phone'); setPaymentError(null); }}
                >
                  <RefreshCw size={14} /> Try Again
                </Button>
                <button
                  onClick={() => setPaymentGate(null)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )}

    {reportShareModal && (
      <ReportShareModal
        reportId={reportShareModal.reportId}
        reportName={reportShareModal.reportName}
        initialOption={reportShareModal.initialOption}
        initialSelected={reportShareModal.initialSelected}
        retailerBusinessType={businessType}
        onClose={() => setReportShareModal(null)}
        onSaved={(vis, allowed) => {
          toast({
            title: 'Sharing updated',
            description:
              vis === 'public'
                ? 'This report is now visible to all wholesalers.'
                : vis === 'sameBusiness'
                ? 'This report is now visible to wholesalers in your business type.'
                : `This report is now shared with ${allowed.length} specific wholesaler${allowed.length !== 1 ? 's' : ''}.`,
          });
        }}
      />
    )}

    {showCardSettings && (
      <RetailerCardSettings
        onClose={() => setShowCardSettings(false)}
        onConnected={() => { setShowCardSettings(false); setShowCardConnectedDialog(true); }}
      />
    )}

    {showCardConnectedDialog && (
      <CardConnectedSuccessDialog
        onUpload={() => { setShowCardConnectedDialog(false); pendingSellerRef.current = true; openPicker(); }}
        onLater={() => setShowCardConnectedDialog(false)}
      />
    )}

    {showSellerGate && (
      <SellerModeGateDialog
        mode={showSellerGate}
        onUpload={handleSellerUpload}
        onCancel={() => setShowSellerGate(null)}
      />
    )}

    {showSellerCardDialog && (
      <SellerCardRequiredDialog
        onConnect={handleSellerConnectCard}
        onSkip={handleSellerSkipCard}
        onCancel={() => setShowSellerCardDialog(false)}
      />
    )}

    {showSellerView && sellerTrustScore && sellerLastStatementAt && (
      <SellerModeView
        score={sellerTrustScore.score}
        grade={sellerTrustScore.grade}
        label={sellerTrustScore.label}
        businessName={user?.displayName || user?.email?.split('@')[0] || 'Your Business'}
        businessType={businessType}
        lastStatementAt={sellerLastStatementAt}
        sellerId={uid}
        sellerEmail={user?.email || ''}
        onClose={() => setShowSellerView(false)}
        onRefresh={handleSellerRefresh}
    />
    )}

    {showSellerView && !sellerTrustScore && (
      <SellerModeBlankView
        onClose={() => setShowSellerView(false)}
      />
    )}
  </>);
}
