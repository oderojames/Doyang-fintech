import { Router } from "express";
import OpenAI from "openai";
import { getAdminFirestore } from "../../lib/firebase-admin.js";

function getOpenAI(): OpenAI | null {
  const apiKey = process.env["OPENAI_API_KEYS"] ?? process.env["OPENAI_API_KEY"] ?? "";
  if (!apiKey) return null;
  const isOpenRouter = apiKey.startsWith("sk-or-");
  return new OpenAI({
    apiKey,
    ...(isOpenRouter ? { baseURL: "https://openrouter.ai/api/v1" } : {}),
  });
}

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTransaction {
  date: string;
  amount: number;
  type: "credit" | "debit";
  description: string;
  category: string;
  isFee?: boolean;
}

interface BehavioralInsight {
  type: "positive" | "negative" | "warning";
  title: string;
  description: string;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function extractDate(text: string): string | null {
  // DD/MM/YYYY or D/M/YY (most common in M-Pesa statements)
  let m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2}|\d{2})\b/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD MMM YYYY or DD-MMM-YYYY
  m = text.match(/\b(\d{1,2})[\s\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s\-,]+(20\d{2})\b/i);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase().slice(0, 3)] ?? "01";
    return `${m[3]}-${mo}-${m[1].padStart(2, "0")}`;
  }
  // MMM DD YYYY
  m = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})[,\s]+(20\d{2})\b/i);
  if (m) {
    const mo = MONTH_MAP[m[1].toLowerCase().slice(0, 3)] ?? "01";
    return `${m[3]}-${mo}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

// ─── Amount extraction ────────────────────────────────────────────────────────

const AMOUNT_RE = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;

function extractAmounts(text: string): number[] {
  // Strip tagged markers before scanning so they don't double-count
  const clean = text.replace(/\|PAIDIN=[\d.]+/g, "").replace(/\|WITHDRAWN=[\d.]+/g, "").replace(/\|BALANCE=[\d.]+/g, "");
  return [...clean.matchAll(AMOUNT_RE)]
    .map(m => parseFloat(m[1].replace(/,/g, "")))
    .filter(a => a > 0 && a < 50_000_000);
}

/** Extract column-tagged amounts from frontend-tagged rows.
 *  Returns null if the row wasn't tagged (fallback path applies). */
function extractTaggedAmounts(text: string): { paidIn: number; withdrawn: number; balance: number } | null {
  const paidInM    = text.match(/\|PAIDIN=([\d.]+)/);
  const withdrawnM = text.match(/\|WITHDRAWN=([\d.]+)/);
  const balanceM   = text.match(/\|BALANCE=([\d.]+)/);
  if (!paidInM && !withdrawnM) return null;        // untagged row
  return {
    paidIn:    paidInM    ? parseFloat(paidInM[1])    : 0,
    withdrawn: withdrawnM ? parseFloat(withdrawnM[1]) : 0,
    balance:   balanceM   ? parseFloat(balanceM[1])   : 0,
  };
}

// ─── Transaction classification ───────────────────────────────────────────────

const CREDIT_RE =
  /received from|you received|cash received|paid to you|payment received|business payment received|reversal|deposited by agent|mpesa deposit|transfer received|deposited for\b|salary\b|cash deposit|airtime commission|business credit/i;

const DEBIT_RE =
  /withdrawal|send money|sent to|pay bill|paybill|buy goods|lipa na mpesa|airtime (?:for|purchase|\d{10})|transaction cost|charge for|fuliza|loan repayment|kcb mpesa|okoa jahazi|till number|merchant payment|global pay|m-shwari|lock savings|funds transfer/i;

const FEE_RE = /transaction cost|charge for/i;

const FAILED_RE = /\b(failed|reversed|cancelled|declined)\b/i;

const SKIP_RE =
  /^(receipt no|completion time|details|transaction status|paid in|withdrawn|balance|transaction|m-pesa statement|safaricom|page \d|customer name|account no|phone|period:|opening balance|closing balance|statement period|dear |to whom|total paid|total withdrawn|total money|summary)/i;

function classify(text: string): "credit" | "debit" | null {
  if (CREDIT_RE.test(text)) return "credit";
  if (DEBIT_RE.test(text)) return "debit";
  return null;
}

// ─── Description cleaning ─────────────────────────────────────────────────────

function cleanDescription(text: string): string {
  return text
    // Strip frontend column tags first (|PAIDIN=xxx, |WITHDRAWN=xxx, |BALANCE=xxx)
    .replace(/\s*\|(?:PAIDIN|WITHDRAWN|BALANCE)=[\d.]*\s*/gi, " ")
    // Strip dates and times
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-](?:20)?\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/g, "")
    .replace(/\b20\d{2}-\d{2}-\d{2}(?:[\sT]\d{1,2}:\d{2}(?::\d{2})?)?\b/g, "")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi, "")
    // Strip monetary amounts (comma-formatted and unformatted 4+ digit numbers)
    .replace(AMOUNT_RE, "")
    .replace(/\b\d{4,}(?:\.\d{1,2})?\b/g, "")
    // Strip receipt numbers — require at least one digit to avoid matching English words
    .replace(/\b[A-Z]{2,4}[A-Z0-9]{6,10}\b/g, m => /\d/.test(m) ? "" : m)
    // Strip status words
    .replace(/\b(completed|failed|cancelled|declined|reversed)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Category mapping ─────────────────────────────────────────────────────────

function categorize(desc: string, type: "credit" | "debit"): { category: string; isFee: boolean } {
  const d = desc.toLowerCase();
  if (FEE_RE.test(d)) return { category: "Other", isFee: true };
  if (/pay bill|paybill|buy goods|till number|lipa na mpesa|merchant/.test(d)) return { category: "Bill Payment", isFee: false };
  if (/\bairtime\b/.test(d)) return { category: "Airtime", isFee: false };
  if (/fuliza|loan repayment|kcb mpesa|okoa jahazi|m-shwari/.test(d)) return { category: "Loan", isFee: false };
  if (/withdrawal/.test(d)) return { category: "Withdrawal", isFee: false };
  if (/send money|sent to|funds transfer/.test(d)) return { category: "Transfer", isFee: false };
  if (type === "credit") return { category: "Income", isFee: false };
  return { category: "Other", isFee: false };
}

// ─── M-Pesa statement parser ──────────────────────────────────────────────────

// Safaricom M-Pesa receipt numbers: 2-4 uppercase letters + 6-10 alphanumeric chars
const RECEIPT_RE = /\b([A-Z]{2,4}[A-Z0-9]{6,10})\b/;

/**
 * Parse a M-Pesa statement text (tab-separated rows from position-aware pdfjs extraction,
 * or fallback space-joined text).
 *
 * M-Pesa statement columns (tab-separated per visual row):
 *   [0] Receipt No  [1] Completion Time  [2..n-3] Details  [n-2] Paid In or Withdrawn  [n-1] Balance
 *
 * Strategy:
 * 1. Normalise tabs → spaces so all processing works on plain strings.
 * 2. Anchor on receipt numbers to collect one transaction per segment.
 * 3. Within each segment: extract date, classify credit/debit by keywords,
 *    then pick the second-to-last amount (last = running balance).
 * 4. Fallback: keyword + date line scan if no receipt numbers found.
 */
function parseTransactions(rawText: string): RawTransaction[] {
  const results: RawTransaction[] = [];

  // Normalise: CR, then convert tabs → single space so downstream regexes work uniformly.
  const text = rawText
    .replace(/\r\n|\r/g, "\n")
    .replace(/\t/g, " ");          // TAB → space; amounts/dates stay findable

  const lines = text
    .split("\n")
    .map(l => l.replace(/\s{2,}/g, " ").trim())
    .filter(l => l.length > 5);

  // ── Strategy 1: Receipt-number anchored ───────────────────────────────────
  // The frontend emits one tagged row per transaction:
  //   "OAX... date desc |PAIDIN=1000 |BALANCE=5000"   (credit)
  //   "OBX... date desc |WITHDRAWN=500 |BALANCE=4500"  (debit)
  // A receipt number marks the start of a transaction segment.
  const segments: string[] = [];
  let buffer = "";

  for (const line of lines) {
    // Skip explicit header markers and table headers
    if (line === "##HEADER##") continue;
    if (SKIP_RE.test(line) && !RECEIPT_RE.test(line)) continue;

    if (RECEIPT_RE.test(line)) {
      if (buffer) segments.push(buffer.trim());
      buffer = line;
    } else if (buffer) {
      buffer += " " + line;
    } else if (CREDIT_RE.test(line) || DEBIT_RE.test(line)) {
      buffer = line;
    }
  }
  if (buffer) segments.push(buffer.trim());

  for (const seg of segments) {
    if (FAILED_RE.test(seg)) continue;

    const date = extractDate(seg);
    if (!date) continue;

    // ── Path A: column-tagged row (accurate) ─────────────────────────────
    const tagged = extractTaggedAmounts(seg);
    if (tagged) {
      let amount = 0;
      let type: "credit" | "debit";

      if (tagged.paidIn > 0 && tagged.withdrawn > 0) {
        // Both columns filled → use keyword to decide (shouldn't happen in normal statements)
        const kw = classify(seg);
        type   = kw ?? "debit";
        amount = type === "credit" ? tagged.paidIn : tagged.withdrawn;
      } else if (tagged.paidIn > 0) {
        type   = "credit";
        amount = tagged.paidIn;
      } else if (tagged.withdrawn > 0) {
        type   = "debit";
        amount = tagged.withdrawn;
      } else {
        continue; // Neither column has a value — balance-only row or header
      }

      if (!amount || amount <= 0) continue;

      const desc = cleanDescription(seg);
      if (!desc || desc.length < 4) continue;

      const { category, isFee } = categorize(desc, type);
      results.push({ date, amount, type, description: desc, category, isFee });
      continue;
    }

    // ── Path B: untagged row — keyword + positional heuristic (fallback) ─
    const type = classify(seg);
    if (!type) continue;

    const amounts = extractAmounts(seg);
    if (!amounts.length) continue;

    // Last amount = running balance; second-to-last = transaction amount
    const nonZero = amounts.filter(a => a > 0);
    if (!nonZero.length) continue;
    const amount = nonZero.length >= 2 ? nonZero[nonZero.length - 2] : nonZero[0];
    if (!amount || amount <= 0) continue;

    const desc = cleanDescription(seg);
    if (!desc || desc.length < 4) continue;

    const { category, isFee } = categorize(desc, type);
    results.push({ date, amount, type, description: desc, category, isFee });
  }

  // ── Strategy 2: Keyword line-by-line fallback (no receipt numbers found) ─
  if (results.length === 0) {
    for (const line of lines) {
      if (line === "##HEADER##") continue;
      if (SKIP_RE.test(line) || line.length < 15) continue;
      if (FAILED_RE.test(line)) continue;

      // Try tagged path first
      const tagged = extractTaggedAmounts(line);
      if (tagged && extractDate(line)) {
        const type: "credit" | "debit" = tagged.paidIn > 0 ? "credit" : "debit";
        const amount = tagged.paidIn > 0 ? tagged.paidIn : tagged.withdrawn;
        if (amount > 0) {
          const date = extractDate(line)!;
          const desc = cleanDescription(line);
          if (desc && desc.length >= 4) {
            const { category, isFee } = categorize(desc, type);
            results.push({ date, amount, type, description: desc, category, isFee });
            continue;
          }
        }
      }

      const type = classify(line);
      if (!type) continue;

      const date = extractDate(line);
      if (!date) continue;

      const amounts = extractAmounts(line);
      if (!amounts.length) continue;

      const nonZero = amounts.filter(a => a > 0);
      if (!nonZero.length) continue;
      const amount = nonZero.length >= 2 ? nonZero[nonZero.length - 2] : nonZero[0];
      if (!amount || amount <= 0) continue;

      const desc = cleanDescription(line);
      if (!desc || desc.length < 4) continue;

      const { category, isFee } = categorize(desc, type);
      results.push({ date, amount, type, description: desc, category, isFee });
    }
  }

  return results;
}

// ─── Deduplicate ──────────────────────────────────────────────────────────────

function dedup(txs: RawTransaction[]): RawTransaction[] {
  const seen = new Set<string>();
  return txs.filter(t => {
    const key = `${t.date}|${t.amount}|${t.type}|${t.description.slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

type ScoreFactor = { name: string; score: number; weight: number; impact: "positive" | "neutral" | "negative"; detail: string };

function computeScore(
  txs: RawTransaction[],
  paymentMethod = "sendmoney",
  incomeOverride?: number | null,
  expenditureOverride?: number | null,
) {
  const hasIncomeOverride      = typeof incomeOverride === "number" && Number.isFinite(incomeOverride) && incomeOverride >= 0;
  const hasExpenditureOverride = typeof expenditureOverride === "number" && Number.isFinite(expenditureOverride) && expenditureOverride >= 0;
  // ── Income filter by payment method ─────────────────────────────────────────
  const PAYBILL_IN_RE    = /business payment|lipa na mpesa.*paybill|received.*paybill|paybill.*received|pay bill.*received/i;
  const TILLNUMBER_IN_RE = /merchant payment|buy goods|till number|lipa na mpesa.*goods|pochi la biashara/i;
  const BANK_IN_RE       = /bank.*transfer|received from bank|bank credit|rtgs|eft|bank payment/i;

  const isBusinessIncome = (t: RawTransaction): boolean => {
    if (t.type !== "credit") return false;
    switch (paymentMethod) {
      case "paybill":     return PAYBILL_IN_RE.test(t.description);
      case "tillnumber":  return TILLNUMBER_IN_RE.test(t.description);
      case "bankpaybill": return BANK_IN_RE.test(t.description);
      default:            return true; // sendmoney: all credits count
    }
  };

  const credits    = txs.filter(isBusinessIncome);
  const debits     = txs.filter(t => t.type === "debit" && !t.isFee);
  const fees       = txs.filter(t => t.isFee);
  const allCredits = txs.filter(t => t.type === "credit");

  // Income / expenditure: prefer the summary-table overrides (accurate per-type
  // figures for PayBill / Buy Goods) and fall back to the transaction-level sum.
  const totalIncome      = hasIncomeOverride      ? round2(incomeOverride as number)      : round2(credits.reduce((s, t) => s + t.amount, 0));
  const totalExpenditure = hasExpenditureOverride ? round2(expenditureOverride as number) : round2(debits.reduce((s, t) => s + t.amount, 0));
  const totalFees        = round2(fees.reduce((s, t) => s + t.amount, 0));
  const netCashFlow      = round2(totalIncome - totalExpenditure - totalFees);
  const cashFlowRatio    = totalExpenditure === 0 ? 2.0 : round2(totalIncome / totalExpenditure);

  // ── Monthly breakdown ────────────────────────────────────────────────────────
  const monthMap: Record<string, { income: number; spending: number; incomeCount: number; activeDays: Set<string> }> = {};
  for (const t of txs) {
    const ym = t.date.substring(0, 7);
    if (!ym || ym.length < 7) continue;
    if (!monthMap[ym]) monthMap[ym] = { income: 0, spending: 0, incomeCount: 0, activeDays: new Set() };
    monthMap[ym].activeDays.add(t.date);
    if (isBusinessIncome(t)) { monthMap[ym].income += t.amount; monthMap[ym].incomeCount++; }
    if (t.type === "debit" && !t.isFee) monthMap[ym].spending += t.amount;
  }
  const months     = Object.keys(monthMap).sort();
  const monthCount = months.length || 1;
  const monthlyIncomeAmounts = months.map(m => monthMap[m].income);
  const avgMonthlyIncome = round2(totalIncome / monthCount);
  const avgDailyIncome   = round2(totalIncome / Math.max(daySpan(txs), 1));
  const totalIncomeCount  = credits.length;
  const avgIncomePerMonth = totalIncomeCount / monthCount;

  // ── Shared sub-calcs ─────────────────────────────────────────────────────────
  // Consistency uses the month-by-month income SERIES (always transaction-based)
  // and its own mean — never the override total — so the coefficient of variation
  // measures the real shape of activity over time.
  const seriesMean = monthlyIncomeAmounts.length > 0
    ? monthlyIncomeAmounts.reduce((s, x) => s + x, 0) / monthlyIncomeAmounts.length
    : 0;
  const cv = seriesMean === 0 ? 1 : (() => {
    const variance = monthlyIncomeAmounts.reduce((s, x) => s + Math.pow(x - seriesMean, 2), 0) / monthlyIncomeAmounts.length;
    return Math.sqrt(variance) / seriesMean;
  })();
  const inactiveMonths = monthlyIncomeAmounts.filter(m => m === 0).length;
  const inactiveRatio  = inactiveMonths / monthCount;

  const debtCount  = txs.filter(t => /fuliza|loan repayment|kcb mpesa|okoa jahazi|m-shwari/i.test(t.description)).length;
  const loanTotal  = txs.filter(t => t.category === "Loan").reduce((s, t) => s + t.amount, 0);
  const debtRatio  = totalIncome === 0 ? 0 : loanTotal / totalIncome;

  const savingsCount  = txs.filter(t => /lock savings|m-shwari deposit|savings|fixed/i.test(t.description)).length;
  const maxWithdrawal = debits.filter(t => t.category === "Withdrawal").reduce((max, t) => Math.max(max, t.amount), 0);
  const payers        = new Set(allCredits.map(t => t.description.replace(/\d{4,}/g, "").trim().toLowerCase().slice(0, 30)));
  const incomeSourceCount = payers.size;
  const monthsWithBills   = months.filter(m => txs.some(t => t.date.startsWith(m) && t.category === "Bill Payment")).length;

  // ── S1: Cash Flow Consistency (28 pts) ──────────────────────────────────────
  let S1: number;
  if      (cv <= 0.10 && inactiveRatio === 0  ) S1 = 28;
  else if (cv <= 0.20 && inactiveRatio <= 0.10) S1 = 24;
  else if (cv <= 0.35 && inactiveRatio <= 0.20) S1 = 19;
  else if (cv <= 0.55 && inactiveRatio <= 0.30) S1 = 13;
  else if (cv <= 0.80                         ) S1 = 7;
  else                                           S1 = 2;

  // ── S2: Monthly Turnover (17 pts) ───────────────────────────────────────────
  let S2: number;
  if      (avgMonthlyIncome >= 500_000) S2 = 17;
  else if (avgMonthlyIncome >= 200_000) S2 = 15;
  else if (avgMonthlyIncome >= 100_000) S2 = 13;
  else if (avgMonthlyIncome >= 50_000 ) S2 = 10;
  else if (avgMonthlyIncome >= 20_000 ) S2 = 7;
  else if (avgMonthlyIncome >= 10_000 ) S2 = 4;
  else if (avgMonthlyIncome >= 3_000  ) S2 = 2;
  else                                   S2 = 1;

  // ── S3: Transaction Frequency (17 pts) ──────────────────────────────────────
  let S3: number;
  if      (avgIncomePerMonth >= 30) S3 = 17;
  else if (avgIncomePerMonth >= 20) S3 = 14;
  else if (avgIncomePerMonth >= 10) S3 = 11;
  else if (avgIncomePerMonth >= 5 ) S3 = 8;
  else if (avgIncomePerMonth >= 2 ) S3 = 5;
  else if (avgIncomePerMonth >= 1 ) S3 = 2;
  else                               S3 = 0;

  // ── S4: Business Age / Statement Coverage (10 pts) ──────────────────────────
  const dayRange      = daySpan(txs);
  const monthsCovered = dayRange / 30.44;
  let S4: number;
  if      (monthsCovered > 24) S4 = 10;
  else if (monthsCovered >= 12) S4 = 8;
  else if (monthsCovered >= 6 ) S4 = 6;
  else if (monthsCovered >= 3 ) S4 = 3;
  else                           S4 = 1;

  // ── S5: Active Days per Month (10 pts) ──────────────────────────────────────
  const avgActiveDays = months.length > 0
    ? months.reduce((sum, m) => sum + monthMap[m].activeDays.size, 0) / months.length
    : 0;
  let S5: number;
  if      (avgActiveDays > 25)  S5 = 10;
  else if (avgActiveDays >= 20) S5 = 8;
  else if (avgActiveDays >= 15) S5 = 5;
  else                           S5 = 2;

  // ── S6: Repayment History (10 pts) ──────────────────────────────────────────
  let S6: number;
  if      (debtCount === 0    ) S6 = 10;
  else if (debtRatio <= 0.05  ) S6 = 8;
  else if (debtRatio <= 0.10  ) S6 = 6;
  else if (debtRatio <= 0.20  ) S6 = 4;
  else if (debtRatio <= 0.35  ) S6 = 2;
  else                           S6 = 0;

  // ── S7: M-Pesa Account Activity (5 pts) ─────────────────────────────────────
  const hasDeposits    = txs.some(t => /deposit|cash deposit|deposited/i.test(t.description) && t.type === "credit");
  const hasWithdrawals = txs.some(t => t.category === "Withdrawal");
  const hasSendMoney   = txs.some(t => /send money|sent to|funds transfer/i.test(t.description));
  const hasBuyGoods    = txs.some(t => /buy goods|till number|merchant/i.test(t.description));
  const hasPayBill     = txs.some(t => /pay bill|paybill|lipa na mpesa/i.test(t.description));
  const activityCount  = [hasDeposits, hasWithdrawals, hasSendMoney, hasBuyGoods, hasPayBill].filter(Boolean).length;
  let S7: number;
  if      (activityCount >= 5) S7 = 5;
  else if (activityCount >= 4) S7 = 4;
  else if (activityCount >= 3) S7 = 3;
  else if (activityCount >= 2) S7 = 2;
  else                          S7 = 1;

  // ── S8: Revenue Growth Trend (3 pts) ────────────────────────────────────────
  let S8 = 1;
  if (months.length >= 3) {
    const half       = Math.max(1, Math.floor(months.length / 2));
    const firstHalf  = monthlyIncomeAmounts.slice(0, half);
    const secondHalf = monthlyIncomeAmounts.slice(months.length - half);
    const firstAvg   = firstHalf.reduce((s, x) => s + x, 0) / firstHalf.length;
    const secondAvg  = secondHalf.reduce((s, x) => s + x, 0) / secondHalf.length;
    const growthRate = firstAvg === 0 ? 0 : (secondAvg - firstAvg) / firstAvg;
    if      (growthRate >  0.05) S8 = 3;
    else if (growthRate >= -0.05) S8 = 2;
    else                          S8 = 1;
  }

  // ── Risk Factors (−10 max penalty) ──────────────────────────────────────────
  let penalty = 0;
  if      (inactiveMonths >= 2) penalty += 4;
  else if (inactiveMonths === 1) penalty += 2;

  const crashMonths = monthlyIncomeAmounts.filter(m => avgMonthlyIncome > 0 && m < avgMonthlyIncome * 0.20 && m > 0).length;
  if      (crashMonths >= 2) penalty += 3;
  else if (crashMonths === 1) penalty += 1;

  const spikeMonths = monthlyIncomeAmounts.filter(m => avgMonthlyIncome > 0 && m > avgMonthlyIncome * 5).length;
  if (spikeMonths >= 1) penalty += 2;

  if      (debtRatio > 0.35) penalty += 3;
  else if (debtRatio > 0.20) penalty += 1;

  const riskPenalty = Math.min(10, penalty);

  // ── Final score ──────────────────────────────────────────────────────────────
  const rawScore   = S1 + S2 + S3 + S4 + S5 + S6 + S7 + S8 - riskPenalty;
  const finalScore = Math.max(0, Math.min(100, rawScore));

  const { grade, label, limitMult } = gradeFor(finalScore);
  const creditLimit = Math.round(avgMonthlyIncome * limitMult);

  const riskLevel = finalScore >= 85 ? "Low"
    : finalScore >= 70 ? "Low-Medium"
    : finalScore >= 55 ? "Medium"
    : finalScore >= 40 ? "High"
    : "Very High";

  const recommendation = finalScore >= 85 ? "Approve"
    : finalScore >= 70 ? "Approve with conditions"
    : finalScore >= 55 ? "Further review required"
    : finalScore >= 40 ? "Caution — review required"
    : "Decline";

  // ── Monthly / daily income ───────────────────────────────────────────────────
  const incomeByMonth = months.map(m => ({ month: m, amount: monthMap[m].income, count: monthMap[m].incomeCount }));
  const peak   = incomeByMonth.reduce((a, b) => b.amount > a.amount ? b : a, incomeByMonth[0] ?? { month: "", amount: 0, count: 0 });
  const lowest = incomeByMonth.reduce((a, b) => b.amount < a.amount ? b : a, incomeByMonth[0] ?? { month: "", amount: 0, count: 0 });

  const dayMap: Record<string, { sum: number; count: number }> = {};
  for (const t of credits) {
    if (!dayMap[t.date]) dayMap[t.date] = { sum: 0, count: 0 };
    dayMap[t.date].sum   += t.amount;
    dayMap[t.date].count += 1;
  }
  const dailyIncome   = Object.keys(dayMap).sort().map(d => ({ date: d, amount: round2(dayMap[d].sum), transactionCount: dayMap[d].count }));
  const monthlyIncome = incomeByMonth.map(m => ({ month: m.month, label: monthLabel(m.month), amount: round2(m.amount), transactionCount: m.count }));

  // ── Factors array ────────────────────────────────────────────────────────────
  const riskDesc = [
    inactiveMonths >= 1 ? `${inactiveMonths} inactive month${inactiveMonths > 1 ? "s" : ""}` : null,
    crashMonths >= 1    ? "revenue crashes" : null,
    spikeMonths >= 1    ? "suspicious spikes" : null,
    debtRatio > 0.20    ? "high loan reliance" : null,
  ].filter(Boolean).join(", ");

  const factors: ScoreFactor[] = [
    { name: "Cash Flow Consistency",  score: Math.round((S1 / 28) * 100), weight: 28, impact: impactOf(Math.round((S1 / 28) * 100)), detail: `CV=${cv.toFixed(2)} — ${inactiveMonths} inactive month${inactiveMonths !== 1 ? "s" : ""} out of ${monthCount}` },
    { name: "Monthly Turnover",       score: Math.round((S2 / 17) * 100), weight: 17, impact: impactOf(Math.round((S2 / 17) * 100)), detail: `Avg KES ${fmt(avgMonthlyIncome)}/month` },
    { name: "Transaction Frequency",  score: Math.round((S3 / 17) * 100), weight: 17, impact: impactOf(Math.round((S3 / 17) * 100)), detail: `Avg ${avgIncomePerMonth.toFixed(1)} income transactions/month` },
    { name: "Business Age",           score: Math.round((S4 / 10) * 100), weight: 10, impact: impactOf(Math.round((S4 / 10) * 100)), detail: `${Math.round(monthsCovered)} month${Math.round(monthsCovered) !== 1 ? "s" : ""} of statement history` },
    { name: "Active Days per Month",  score: Math.round((S5 / 10) * 100), weight: 10, impact: impactOf(Math.round((S5 / 10) * 100)), detail: `Avg ${avgActiveDays.toFixed(1)} active days/month` },
    { name: "Repayment History",      score: Math.round((S6 / 10) * 100), weight: 10, impact: impactOf(Math.round((S6 / 10) * 100)), detail: `${debtCount} loan/Fuliza event${debtCount !== 1 ? "s" : ""} — ${(debtRatio * 100).toFixed(1)}% of income` },
    { name: "M-Pesa Account Activity",score: Math.round((S7 / 5)  * 100), weight: 5,  impact: impactOf(Math.round((S7 / 5)  * 100)), detail: `${activityCount} of 5 M-Pesa activity types used` },
    { name: "Revenue Growth Trend",   score: Math.round((S8 / 3)  * 100), weight: 3,  impact: S8 === 3 ? "positive" : S8 === 2 ? "neutral" : "negative", detail: S8 === 3 ? "Positive revenue growth" : S8 === 2 ? "Stable revenue" : "Revenue declining" },
    ...(riskPenalty > 0 ? [{ name: "Risk Factors", score: Math.round(((10 - riskPenalty) / 10) * 100), weight: -riskPenalty, impact: "negative" as const, detail: `−${riskPenalty} pts: ${riskDesc}` }] : []),
  ];

  return {
    metrics: {
      totalIncome, totalExpenditure, netCashFlow, cashFlowRatio,
      avgMonthlyIncome, avgDailyIncome, monthCount, avgIncomePerMonth,
      debtCount, debtRatio, savingsCount, incomeSourceCount, maxWithdrawal, totalFees,
      totalIncomeCount, totalTransactions: txs.length,
      incomeTransactions: credits.length, expenditureTransactions: debits.length,
      periodStart: txs.find(t => t.date)?.date ?? "",
      periodEnd: [...txs].reverse().find(t => t.date)?.date ?? "",
      peakIncomeMonth: peak.month, lowestIncomeMonth: lowest.month, cv,
      monthsWithBills, avgActiveDays, riskPenalty, inactiveMonths,
    },
    score: { finalScore, grade, label, creditLimit, riskLevel, recommendation, factors },
    dailyIncome,
    monthlyIncome,
  };
}

// ─── Deterministic insights ───────────────────────────────────────────────────

function generateInsights(
  metrics: ReturnType<typeof computeScore>["metrics"],
  score: ReturnType<typeof computeScore>["score"]
): BehavioralInsight[] {
  const insights: BehavioralInsight[] = [];

  // 1. Cash flow consistency
  if (metrics.cv <= 0.20 && metrics.inactiveMonths === 0) {
    insights.push({
      type: "positive",
      title: "Highly consistent monthly income",
      description: `Monthly business income is stable — only ${(metrics.cv * 100).toFixed(0)}% variation across ${metrics.monthCount} months, averaging KES ${fmt(metrics.avgMonthlyIncome)}/month. Consistent inflows strongly support loan repayment capacity.`,
    });
  } else if (metrics.inactiveMonths >= 2) {
    insights.push({
      type: "negative",
      title: `${metrics.inactiveMonths} inactive months detected`,
      description: `Business income was zero in ${metrics.inactiveMonths} of ${metrics.monthCount} months. Extended inactivity significantly increases repayment risk and reduces the credit score.`,
    });
  } else if (metrics.inactiveMonths === 1) {
    insights.push({
      type: "warning",
      title: "One inactive month detected",
      description: `Business had no income in 1 of ${metrics.monthCount} months. Periodic inactivity can create cash flow gaps that may affect loan repayments.`,
    });
  } else {
    insights.push({
      type: "warning",
      title: "Moderate income variability",
      description: `Monthly income varies by ${(metrics.cv * 100).toFixed(0)}% around an average of KES ${fmt(metrics.avgMonthlyIncome)}/month over ${metrics.monthCount} months. More stable operations would improve the credit profile.`,
    });
  }

  // 2. Transaction frequency
  if (metrics.avgIncomePerMonth >= 20) {
    insights.push({
      type: "positive",
      title: "High business transaction frequency",
      description: `Averaging ${metrics.avgIncomePerMonth.toFixed(1)} income transactions per month demonstrates a busy, active business with a steady customer base — a strong creditworthiness signal.`,
    });
  } else if (metrics.avgIncomePerMonth >= 5) {
    insights.push({
      type: "warning",
      title: "Moderate transaction frequency",
      description: `Averaging ${metrics.avgIncomePerMonth.toFixed(1)} income transactions per month. Higher activity levels would further demonstrate business viability and repayment capacity.`,
    });
  } else {
    insights.push({
      type: "negative",
      title: "Low transaction frequency",
      description: `Only ${metrics.avgIncomePerMonth.toFixed(1)} income transactions per month on average — this limits confidence in regular business activity. More frequent transactions indicate stronger creditworthiness.`,
    });
  }

  // 3. Repayment history
  if (metrics.debtCount === 0) {
    insights.push({
      type: "positive",
      title: "No mobile loan activity detected",
      description: `No Fuliza, M-Shwari, KCB M-Pesa, or Okoa Jahazi events found over ${metrics.monthCount} months. Self-sufficient cash management without reliance on mobile credit is a strong indicator of financial discipline.`,
    });
  } else {
    const debtPct = (metrics.debtRatio * 100).toFixed(1);
    insights.push({
      type: metrics.debtRatio > 0.20 ? "negative" : "warning",
      title: `${metrics.debtCount} mobile loan event${metrics.debtCount !== 1 ? "s" : ""} detected`,
      description: `Loan/Fuliza activity represents ${debtPct}% of business income. ${metrics.debtRatio > 0.20 ? "High reliance on mobile credit may impair the ability to service new credit obligations." : "Debt usage is within manageable limits but should be monitored carefully."}`,
    });
  }

  // 4. Active days per month
  if (metrics.avgActiveDays >= 20) {
    insights.push({
      type: "positive",
      title: "Business operates consistently throughout the month",
      description: `Averaging ${metrics.avgActiveDays.toFixed(1)} active days per month demonstrates regular operations and a dependable, continuous income stream.`,
    });
  } else if (metrics.avgActiveDays >= 15) {
    insights.push({
      type: "warning",
      title: "Moderate daily business activity",
      description: `${metrics.avgActiveDays.toFixed(1)} active transaction days per month on average. Increasing operational frequency would strengthen the creditworthiness profile.`,
    });
  } else {
    insights.push({
      type: "negative",
      title: "Low daily activity levels",
      description: `Only ${metrics.avgActiveDays.toFixed(1)} active days per month on average. Infrequent operations suggest limited business activity and reduce confidence in steady cash flow.`,
    });
  }

  // 5. Risk factors summary or overall profile
  if (metrics.riskPenalty >= 5) {
    insights.push({
      type: "negative",
      title: "Significant risk factors detected",
      description: `A penalty of ${metrics.riskPenalty} points was applied due to: long inactivity periods, revenue crashes, suspicious transaction spikes, or high loan reliance. These factors materially reduce the credit score.`,
    });
  } else if (score.finalScore >= 70) {
    insights.push({
      type: "positive",
      title: "Healthy overall business financial profile",
      description: `Score of ${score.finalScore}/100 (${score.label}) — average monthly turnover of KES ${fmt(metrics.avgMonthlyIncome)} supports a recommended credit limit of KES ${fmt(score.creditLimit)}.`,
    });
  } else {
    insights.push({
      type: "warning",
      title: "Profile requires improvement",
      description: `Score of ${score.finalScore}/100 (${score.label}). Improving transaction frequency, maintaining consistent monthly income, and reducing mobile loan dependency would significantly boost future assessments.`,
    });
  }

  return insights.slice(0, 5);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number) { return Math.round(n * 100) / 100; }
function fmt(n: number) { return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function impactOf(score: number): "positive" | "neutral" | "negative" {
  return score >= 65 ? "positive" : score >= 40 ? "neutral" : "negative";
}

function daySpan(txs: RawTransaction[]) {
  if (!txs.length) return 1;
  const dates = txs.map(t => new Date(t.date).getTime()).filter(d => !isNaN(d));
  if (!dates.length) return 1;
  return Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400_000) + 1);
}

function gradeFor(score: number): { grade: string; label: string; limitMult: number } {
  if (score >= 85) return { grade: "A", label: "Excellent",       limitMult: 0.275 }; // 25–30% of avg monthly turnover
  if (score >= 70) return { grade: "B", label: "Good",            limitMult: 0.20  }; // 15–25%
  if (score >= 55) return { grade: "C", label: "Fair",            limitMult: 0.125 }; // 10–15%
  if (score >= 40) return { grade: "D", label: "Review Required", limitMult: 0.075 }; // 5–10%
  return               { grade: "E", label: "High Risk",          limitMult: 0     }; // no credit
}

function monthLabel(ym: string) {
  if (!ym || ym.length < 7) return ym;
  const [y, mo] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(mo, 10) - 1] ?? mo} ${y}`;
}

// ─── Customer name extraction ─────────────────────────────────────────────────

/** Scan the first ~50 lines of the statement for the account holder's name.
 *  Handles common Safaricom M-Pesa statement layouts. */
function extractCustomerName(text: string): string | null {
  const topLines = text.split("\n").slice(0, 50);
  const top = topLines.join("\n");

  // Words that appear in statement headers but are NOT customer names
  const HEADER_WORDS = new Set([
    "MPESA","M-PESA","SAFARICOM","STATEMENT","ACCOUNT","CUSTOMER",
    "MOBILE","MONEY","PAGE","DATE","PERIOD","LIMITED","KENYA","FULL",
    "MINI","RECEIPT","DETAILS","STATUS","BALANCE","WITHDRAWN","PAID",
    "TRANSACTION","COMPLETION","TIME","NUMBER","NO","FOR","TO","FROM",
  ]);

  const isPersonName = (s: string) => {
    const words = s.trim().split(/\s+/);
    if (words.length < 2 || words.length > 5) return false;
    // Each word must be 2+ letters, not a header word
    return words.every(w => w.length >= 2 && !HEADER_WORDS.has(w.toUpperCase()));
  };

  // Pattern 1: label immediately followed by the name on the SAME line
  //   "Customer Name: JOHN DOE"  |  "Account Name JANE WANJIRU"
  //   "Full Statement For: PETER KAMAU"  |  "Subscriber Name: ..."
  const LABEL_RE = /(?:customer\s*name|account\s*(?:name|holder)|full\s*(?:name|statement\s*for)|statement\s*for|subscriber(?:\s*name)?|prepared\s*for|mobile\s*subscriber|name)\s*[:\-]?\s*(.{3,50})/gi;
  let m: RegExpExecArray | null;
  while ((m = LABEL_RE.exec(top)) !== null) {
    const candidate = m[1].trim().replace(/\s+/g, " ").split(/[,|;]/)[0].trim();
    if (isPersonName(candidate)) return candidate;
  }

  // Pattern 2: label on one line, name on the VERY NEXT line
  for (let i = 0; i < topLines.length - 1; i++) {
    if (/(?:customer\s*name|account\s*(?:name|holder)|subscriber|full\s*name)/i.test(topLines[i])) {
      const next = topLines[i + 1].trim().replace(/\s+/g, " ");
      if (isPersonName(next)) return next;
    }
  }

  // Pattern 3: a standalone run of 2-4 ALL-CAPS words (common Kenyan name format)
  const ALL_CAPS_RE = /\b([A-Z]{2,}(?:\s+[A-Z]{2,}){1,4})\b/g;
  while ((m = ALL_CAPS_RE.exec(top)) !== null) {
    const candidate = m[1].trim();
    if (isPersonName(candidate)) return candidate;
  }

  return null;
}

// ─── Customer phone extraction ────────────────────────────────────────────────

/** Normalise a raw phone string to +254XXXXXXXXX format where possible. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+254${digits.slice(1)}`;
  return raw.trim();
}

/** Scan the first ~50 lines for the account holder's phone number.
 *  Handles patterns like "Mobile No: 0722123456", "+254722123456", etc. */
function extractCustomerPhone(text: string): string | null {
  const top = text.split("\n").slice(0, 50).join("\n");

  // Pattern 1: explicit label
  const labeled = top.match(
    /(?:mobile\s*(?:no\.?|number)?|phone(?:\s*no\.?)?|tel(?:ephone)?|contact(?:\s*no\.?)?)\s*[:\-]?\s*(\+?(?:254|0)\d{8,9})/i
  );
  if (labeled) return formatPhone(labeled[1]);

  // Pattern 2: any Kenyan mobile number in the header block
  const bare = top.match(/\b(\+?254\s*[17]\d{8}|0[17]\d{8})\b/);
  if (bare) return formatPhone(bare[1].replace(/\s/g, ""));

  return null;
}

// ─── AI summary extraction ────────────────────────────────────────────────────

interface AISummary {
  paidIn: number;
  paidOut: number;
  netCashFlow: number;
  cashFlowRatio: number;
  openingBalance: number | null;
  closingBalance: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  monthCount: number;
  averageMonthlyIncome: number;
  averageDailyIncome: number;
  currency: string;
  customerName: string | null;
  customerPhone: string | null;
  // Per-transaction-type figures read from the statement SUMMARY breakdown table.
  // null when that transaction-type row is absent from the summary.
  paybillPaidIn: number | null;
  paybillPaidOut: number | null;
  buyGoodsPaidIn: number | null;
  buyGoodsPaidOut: number | null;
}

async function extractSummaryWithAI(text: string): Promise<AISummary | null> {
  const openai = getOpenAI();
  if (!openai) return null;

  // Send first + last chars to capture both the summary breakdown table (head)
  // and the totals footer (tail). The per-transaction-type breakdown lives on
  // page 1, so use a larger head slice to make sure the whole table is included.
  const head = text.slice(0, 5000);
  const tail = text.slice(-3000);
  const excerpt = head + (text.length > 8000 ? "\n...\n" + tail : "");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 700,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a financial data extractor for Safaricom M-Pesa statements.

Step 1 — Extract EXACTLY from the statement summary section (never from individual transaction rows):
- paidIn: grand-total "Paid In" / "Money In" / "Total Received" figure (this is TOTAL INCOME)
- paidOut: grand-total "Withdrawn" / "Paid Out" / "Money Out" / "Total Sent" figure (this is TOTAL EXPENDITURE)
- openingBalance: opening balance, or null
- closingBalance: closing balance, or null
- periodStart: statement period start date as YYYY-MM-DD, or null
- periodEnd: statement period end date as YYYY-MM-DD, or null
- currency: currency code, default "KES"
- customerName: full customer name, or null
- customerPhone: phone number, or null

Step 1b — The SUMMARY section contains a breakdown table with one row per TRANSACTION TYPE and two money columns ("Paid In" and "Paid Out"). From that table read these specific rows. Match the row by its transaction-type label, case-insensitively, ignoring extra words:
- paybillPaidIn: the "Paid In" amount on the row labelled "Lipa Na M-Pesa (Pay Bill)" / "Pay Bill" / "PayBill" / "Customer PayBill" / "Pay Bill Charges" — use the main Pay Bill row, or null if there is no Pay Bill row.
- paybillPaidOut: the "Paid Out" amount on that SAME Pay Bill row, or null.
- buyGoodsPaidIn: the "Paid In" amount on the row labelled "Lipa Na M-Pesa (Buy Goods)" / "Buy Goods" / "Merchant Payment" / "Customer Merchant Payment" / "Till" — or null if there is no Buy Goods row.
- buyGoodsPaidOut: the "Paid Out" amount on that SAME Buy Goods row, or null.
IMPORTANT: these four values come ONLY from the summary breakdown table, NOT from summing individual transaction rows. If a row or its amount is missing, return null for that field (do not guess, do not use 0 unless the table literally shows 0.00).
NOTE ON "Paid Out": the Paid Out column is often shown as a negative number or in parentheses (e.g. "-120,000.00" or "(120,000.00)"). Always return its POSITIVE magnitude (120000.00), never a negative value. The same applies to the grand-total paidOut.

Step 2 — Calculate derived values using ONLY the extracted figures above:
- netCashFlow: paidIn - paidOut  (can be negative)
- cashFlowRatio: round to 2 decimals — paidIn / paidOut if paidOut > 0, else 2.00
- monthCount: number of calendar months fully or partially covered by the period (at least 1). If period dates unavailable, estimate from context or use 1.
- averageMonthlyIncome: paidIn / monthCount  (round to 2 decimals)
- averageDailyIncome: paidIn / (number of days in period, default 30 if unknown)  (round to 2 decimals)

Rules:
- Strip commas from numbers: "12,345.67" → 12345.67
- Return ONLY valid JSON with all fields — no markdown fences, no explanation.`,
      },
      {
        role: "user",
        content: `M-Pesa statement text:\n\n${excerpt}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(clean) as AISummary;
    if (typeof parsed.paidIn !== "number" || typeof parsed.paidOut !== "number") return null;
    // Paid Out / Paid In are amounts: take positive magnitude (statements often
    // show the Paid Out column as a negative number).
    parsed.paidIn  = round2(Math.abs(parsed.paidIn));
    parsed.paidOut = round2(Math.abs(parsed.paidOut));
    // Ensure all derived fields are numbers with sensible defaults
    parsed.netCashFlow           = typeof parsed.netCashFlow === "number"           ? parsed.netCashFlow           : round2(parsed.paidIn - parsed.paidOut);
    parsed.cashFlowRatio         = typeof parsed.cashFlowRatio === "number"         ? parsed.cashFlowRatio         : parsed.paidOut > 0 ? round2(parsed.paidIn / parsed.paidOut) : 2.0;
    parsed.monthCount            = typeof parsed.monthCount === "number" && parsed.monthCount >= 1 ? Math.round(parsed.monthCount) : 1;
    parsed.averageMonthlyIncome  = typeof parsed.averageMonthlyIncome === "number"  ? parsed.averageMonthlyIncome  : round2(parsed.paidIn / parsed.monthCount);
    parsed.averageDailyIncome    = typeof parsed.averageDailyIncome === "number"    ? parsed.averageDailyIncome    : round2(parsed.paidIn / (parsed.monthCount * 30));
    // Per-type summary figures: keep finite numbers as their positive magnitude
    // (the Paid Out column is often presented as a negative); otherwise null.
    const cleanAmount = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? round2(Math.abs(v)) : null;
    parsed.paybillPaidIn   = cleanAmount(parsed.paybillPaidIn);
    parsed.paybillPaidOut  = cleanAmount(parsed.paybillPaidOut);
    parsed.buyGoodsPaidIn  = cleanAmount(parsed.buyGoodsPaidIn);
    parsed.buyGoodsPaidOut = cleanAmount(parsed.buyGoodsPaidOut);
    return parsed;
  } catch {
    return null;
  }
}

// ─── Retailer Paystack Subaccount ─────────────────────────────────────────────

type SubaccountResult = { subaccountCode: string; subaccountId: number } | null;

/**
 * Creates or updates a Paystack M-PESA mobile-money subaccount for a verified
 * retailer.  The settlement_bank code is discovered dynamically from Paystack's
 * Kenya mobile-money bank list so the code stays correct if Paystack changes it.
 *
 * Returns null (non-fatal) on any Paystack or network error — the verification
 * result is still written to Firestore without a subaccount code.
 */
async function ensureRetailerSubaccount(params: {
  phone: string;
  businessName: string;
  email: string;
  existingSubaccountCode: string | null;
  log: { warn: (obj: unknown, msg?: string) => void };
}): Promise<SubaccountResult> {
  const { phone, businessName, email, existingSubaccountCode, log } = params;

  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) { log.warn("[SellerVerification] PAYSTACK_SECRET_KEY missing — skipping subaccount"); return null; }
  if (!phone) { log.warn("[SellerVerification] No phone extracted — skipping subaccount"); return null; }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  // ── 1. Discover M-PESA bank code for Kenya ─────────────────────────────────
  let mpesaCode: string | null = null;
  try {
    const banksRes = await fetch(
      "https://api.paystack.co/bank?country=kenya&type=mobile_money&perPage=100",
      { headers }
    );
    const banksJson = await banksRes.json() as {
      status: boolean;
      data?: Array<{ name: string; code: string; active: boolean }>;
    };
    if (banksJson.status && Array.isArray(banksJson.data)) {
      const entry = banksJson.data.find(
        (b) => b.active && /safaricom|mpesa|m-pesa/i.test(b.name)
      );
      mpesaCode = entry?.code ?? null;
    }
  } catch (e) {
    log.warn({ e }, "[SellerVerification] Failed to fetch Paystack bank list");
  }

  if (!mpesaCode) {
    log.warn("[SellerVerification] M-PESA bank code not found in Paystack list — skipping subaccount");
    return null;
  }

  // ── 2. Update existing subaccount if one already exists ─────────────────────
  if (existingSubaccountCode) {
    try {
      const updRes = await fetch(
        `https://api.paystack.co/subaccount/${encodeURIComponent(existingSubaccountCode)}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            business_name: businessName,
            settlement_bank: mpesaCode,
            account_number: phone,
            description: `Doyang Verified Seller: ${businessName}`,
          }),
        }
      );
      const upd = await updRes.json() as {
        status: boolean; message: string;
        data?: { subaccount_code: string; id: number };
      };
      if (upd.status && upd.data) {
        return { subaccountCode: upd.data.subaccount_code, subaccountId: upd.data.id };
      }
      log.warn({ msg: upd.message }, "[SellerVerification] Subaccount update failed — will create new");
    } catch (e) {
      log.warn({ e }, "[SellerVerification] Subaccount update error");
    }
  }

  // ── 3. Create new subaccount ─────────────────────────────────────────────────
  try {
    const crRes = await fetch("https://api.paystack.co/subaccount", {
      method: "POST",
      headers,
      body: JSON.stringify({
        business_name: businessName,
        settlement_bank: mpesaCode,
        account_number: phone,
        percentage_charge: 100,
        description: `Doyang Verified Seller: ${businessName}`,
        primary_contact_name: businessName,
        primary_contact_email: email,
      }),
    });
    const cr = await crRes.json() as {
      status: boolean; message: string;
      data?: { subaccount_code: string; id: number };
    };
    if (!cr.status || !cr.data) {
      log.warn({ msg: cr.message }, "[SellerVerification] Subaccount creation failed");
      return null;
    }
    return { subaccountCode: cr.data.subaccount_code, subaccountId: cr.data.id };
  } catch (e) {
    log.warn({ e }, "[SellerVerification] Subaccount creation error");
    return null;
  }
}

// ─── Seller Verification ──────────────────────────────────────────────────────

/**
 * Searches the raw statement text for a qualifying Doyang verification payment.
 *
 * Transaction: "Card Pay Utility to 903470 - M PESA GlobalPay Acc. Doyang +254711577577KE, KES 20"
 *
 * Because Safaricom PDFs use a multi-column table, the description often wraps
 * across 2-3 adjacent lines after text extraction.  We use a ±3-line sliding
 * window around any line that contains one of our unique identifiers, then check
 * the whole block for GlobalPay + Doyang + KES 20 debit.
 */
function verifySellerTransaction(rawText: string): boolean {
  const lines = rawText.replace(/\r\n|\r/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Quick pre-filter: skip lines with none of our three unique markers
    const hasMarker =
      /GlobalPay/i.test(line) ||
      /Doyang/i.test(line) ||
      /254711577577/.test(line);
    if (!hasMarker) continue;

    // Build a ±3-line block to handle wrapped PDF columns
    const start = Math.max(0, i - 3);
    const end   = Math.min(lines.length - 1, i + 3);
    const block = lines.slice(start, end + 1).join(" ");

    // Both identifiers must appear somewhere in the block
    if (!/GlobalPay/i.test(block)) continue;
    if (!/Doyang/i.test(block)) continue;

    // Tagged format from frontend column extraction: |WITHDRAWN=20 or |WITHDRAWN=20.00
    const taggedM = block.match(/\|WITHDRAWN=([\d.]+)/);
    if (taggedM && Math.abs(parseFloat(taggedM[1]) - 20) < 0.005) return true;

    // Fallback for untagged plain-text extraction
    if (!taggedM && !/\|PAIDIN=/.test(block) && /\b20\.00\b/.test(block)) return true;
  }

  return false;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/analyze/mpesa", async (req, res) => {
  const { text, paymentMethod = "sendmoney", uid } = req.body as { text?: string; paymentMethod?: string; uid?: string };
  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "No valid PDF text content provided." });
    return;
  }

  try {
    // ── Step 1: Parse transactions ────────────────────────────────────────────
    let transactions = dedup(parseTransactions(text.trim()));
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    if (transactions.length === 0) {
      res.status(422).json({
        error: "No transactions could be extracted from this statement. Please ensure you are uploading a valid M-Pesa statement PDF.",
      });
      return;
    }

    // ── Step 2: AI summary first, then score using the summary figures ────────
    const aiSummary = await extractSummaryWithAI(text);

    // For PayBill / Buy Goods:
    //   income      = Paid In  on the specific method row in the summary table
    //   expenditure = grand-total Paid Out of the entire statement
    // This reflects that a merchant's business income is the PayBill/Buy Goods
    // inflow, while ALL money leaving the account is their total expenditure.
    let incomeOverride: number | null | undefined;
    let expenditureOverride: number | null | undefined;
    if (paymentMethod === "paybill") {
      incomeOverride      = aiSummary?.paybillPaidIn;
      expenditureOverride = aiSummary?.paidOut;          // grand-total Paid Out
    } else if (paymentMethod === "tillnumber") {
      incomeOverride      = aiSummary?.buyGoodsPaidIn;
      expenditureOverride = aiSummary?.paidOut;          // grand-total Paid Out
    }

    const scored = computeScore(transactions, paymentMethod, incomeOverride, expenditureOverride);
    const { metrics, score, dailyIncome, monthlyIncome } = scored;

    // ── Step 3: Resolve headline totals for display ────────────────────────────
    // sendmoney / bankpaybill: AI grand totals are authoritative.
    // paybill / tillnumber: income from per-method row; expenditure grand total —
    //   both already baked into metrics by computeScore via the overrides above.
    const totalIncome = paymentMethod === "sendmoney"
      ? (aiSummary?.paidIn ?? metrics.totalIncome)
      : metrics.totalIncome;
    const totalExpenditure = paymentMethod === "sendmoney" || paymentMethod === "bankpaybill"
      ? (aiSummary?.paidOut ?? metrics.totalExpenditure)
      : metrics.totalExpenditure;
    const netCashFlow          = round2(totalIncome - totalExpenditure);
    const cashFlowRatio        = totalExpenditure === 0 ? 2.0 : round2(totalIncome / totalExpenditure);
    const monthCount           = aiSummary?.monthCount          ?? (metrics.monthCount || 1);
    const averageMonthlyIncome = paymentMethod === "sendmoney"
      ? (aiSummary?.averageMonthlyIncome ?? round2(totalIncome / monthCount))
      : round2(totalIncome / monthCount);
    const averageDailyIncome   = paymentMethod === "sendmoney"
      ? (aiSummary?.averageDailyIncome ?? round2(totalIncome / Math.max(daySpan(transactions), 1)))
      : round2(totalIncome / Math.max(daySpan(transactions), 1));

    const { grade, label, limitMult } = gradeFor(score.finalScore);
    const creditLimit = Math.round(averageMonthlyIncome * limitMult);

    // Period dates — prefer AI-detected, fall back to transaction range
    const periodStart = aiSummary?.periodStart ?? metrics.periodStart;
    const periodEnd   = aiSummary?.periodEnd   ?? metrics.periodEnd;

    // Customer identity — prefer AI-detected
    const customerName  = aiSummary?.customerName  ?? extractCustomerName(text);
    const customerPhone = aiSummary?.customerPhone ?? extractCustomerPhone(text);
    const currency      = aiSummary?.currency ?? "KES";

    // ── Step 4: Re-generate insights using the corrected figures ─────────────
    const correctedMetrics = {
      ...metrics,
      totalIncome,
      totalExpenditure,
      netCashFlow,
      cashFlowRatio,
      avgMonthlyIncome: averageMonthlyIncome,
      avgDailyIncome:   averageDailyIncome,
    };
    const insights = generateInsights(correctedMetrics, score);

    // ── Step 5: Seller Verification (backend-only) ────────────────────────────
    let sellerVerified = false;
    if (uid && uid.trim().length > 0) {
      sellerVerified = verifySellerTransaction(text);
      const now = new Date().toISOString();
      const trustScoreUpdate = { score: score.finalScore, grade, label };
      try {
        const adminDb = getAdminFirestore();
        const userRef = adminDb.collection("users").doc(uid.trim());
        if (sellerVerified) {
          // Fetch existing user doc to get email, prior subaccount code, and active status
          let userEmail = `seller-${uid.trim()}@doyang.app`;
          let existingSubaccountCode: string | null = null;
          let alreadyActiveSeller = false;
          try {
            const snap = await userRef.get();
            const uData = snap.data();
            if (uData?.email) userEmail = uData.email as string;
            if (uData?.paystackSubaccountCode) existingSubaccountCode = uData.paystackSubaccountCode as string;
            if (uData?.sellerModeActive === true) alreadyActiveSeller = true;
          } catch { /* non-fatal */ }

          // Only create the Paystack subaccount on first-time seller activation.
          // Re-uploads from already-active sellers skip this step.
          const subResult = (!alreadyActiveSeller && customerPhone)
            ? await ensureRetailerSubaccount({
                phone: customerPhone,
                businessName: customerName ?? "Doyang Seller",
                email: userEmail,
                existingSubaccountCode,
                log: req.log,
              })
            : null;

          await userRef.update({
            sellerVerified: true,
            sellerModeActive: true,
            verifiedMpesaWallet: customerPhone ?? null,
            paystackSubaccountCode: subResult?.subaccountCode ?? existingSubaccountCode ?? null,
            sellerVerificationDate: now,
            sellerLastStatementAt: now,
            lastStatementUpload: now,
            sellerTrustScore: trustScoreUpdate,
          });
        } else {
          await userRef.update({
            lastStatementUpload: now,
            sellerTrustScore: trustScoreUpdate,
          });
        }
      } catch (fsErr) {
        req.log.warn({ fsErr }, "[SellerVerification] Firestore update failed (non-fatal)");
      }
    }

    // ── Step 6: Build reasoning string ────────────────────────────────────────
    const pmLabel = paymentMethod === "paybill" ? "M-Pesa PayBill"
      : paymentMethod === "tillnumber"  ? "Till Number (Buy Goods)"
      : paymentMethod === "bankpaybill" ? "Bank PayBill"
      : "Send Money / Pochi la Biashara";

    const reasoning =
      `${grade} grade (${score.finalScore}/100) — ${pmLabel}: ` +
      `income KES ${fmt(totalIncome)} vs spending KES ${fmt(totalExpenditure)} ` +
      `over ${monthCount} month${monthCount !== 1 ? "s" : ""}, ` +
      `avg KES ${fmt(averageMonthlyIncome)}/month. ` +
      (metrics.debtCount > 0
        ? `${metrics.debtCount} loan/Fuliza event${metrics.debtCount > 1 ? "s" : ""} (${(metrics.debtRatio * 100).toFixed(1)}% of income). `
        : "No loan or Fuliza activity. ") +
      (metrics.riskPenalty > 0 ? `Risk penalty: −${metrics.riskPenalty} pts. ` : "") +
      (aiSummary ? "(Statement summary figures used.)" : "");

    // Recent transactions (last 20, newest first)
    const recentTransactions = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);

    res.json({
      sellerVerified,
      customerName,
      customerPhone,
      dailyIncome,
      monthlyIncome,
      trustScore: {
        score: score.finalScore,
        grade,
        label,
        creditLimit,
        reasoning,
        factors: score.factors,
        riskLevel: score.riskLevel,
        recommendation: score.recommendation,
      },
      summary: {
        totalIncome,
        totalExpenditure,
        netCashFlow,
        cashFlowRatio,
        averageMonthlyIncome,
        averageDailyIncome,
        peakIncomeMonth: monthLabel(metrics.peakIncomeMonth),
        lowestIncomeMonth: monthLabel(metrics.lowestIncomeMonth),
        currency,
        periodStart,
        periodEnd,
        totalTransactions: metrics.totalTransactions,
        incomeTransactions: metrics.incomeTransactions,
        expenditureTransactions: metrics.expenditureTransactions,
      },
      behavioralInsights: insights,
      recentTransactions,
    });
  } catch (err: any) {
    req.log.error({ err }, "Analysis failed");
    res.status(500).json({ error: err.message || "Analysis failed. Please try again." });
  }
});

export default router;
