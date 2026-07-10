import { useState } from 'react';
import { CreditCard, Loader2, CheckCircle2, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

declare global {
  interface Window {
    PaystackPop: {
      setup(opts: {
        key: string; email: string; amount: number; currency: string;
        ref: string; channels: string[];
        onClose: () => void;
        callback: (response: { reference: string }) => void;
      }): { openIframe(): void };
    };
  }
}

type Status = 'idle' | 'opening' | 'verifying' | 'success' | 'error';

export default function BuyerConnectCardBanner() {
  const { user, buyerCardConnected, markBuyerCardConnected } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [dismissed, setDismissed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!user || user.role !== 'buyer' || buyerCardConnected !== false || dismissed) {
    return null;
  }

  const verifyAndSave = (reference: string) => {
    setStatus('verifying');
    fetch('/api/paystack/verify-and-refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    })
      .then((r) => { if (!r.ok) throw new Error('Verification failed'); return r.json() as Promise<{ authorization: Record<string, unknown> }>; })
      .then(({ authorization }) => {
        if (!user?.uid) return;
        updateDoc(doc(db, 'users', user.uid), {
          buyerCardConnected: true,
          buyerPaystackAuth: authorization,
        }).catch(() => {});
        markBuyerCardConnected();
        setStatus('success');
      })
      .catch(() => {
        setErrorMsg('Verification failed. Please try again.');
        setStatus('error');
      });
  };

  const handleConnect = () => {
    if (!user?.email) return;
    setStatus('opening');
    setErrorMsg('');

    const run = () => {
      try {
        window.PaystackPop.setup({
          key: PUBLIC_KEY,
          email: user.email!,
          amount: 2000,
          currency: 'KES',
          ref: `buyer-card-${user.uid}-${Date.now()}`,
          channels: ['card'],
          onClose: () => setStatus((s) => (s === 'opening' ? 'idle' : s)),
          callback: (r) => verifyAndSave(r.reference),
        }).openIframe();
      } catch {
        setStatus('error');
        setErrorMsg('Could not open payment popup. Please try again.');
      }
    };

    if (window.PaystackPop) { run(); return; }
    let s = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]') as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement('script');
      s.src = 'https://js.paystack.co/v1/inline.js';
      document.head.appendChild(s);
    }
    s.addEventListener('load', run, { once: true });
  };

  if (status === 'success') {
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20">
        <CheckCircle2 size={15} className="text-green-400 shrink-0" />
        <p className="flex-1 text-sm font-medium text-green-400">
          Card saved! You're all set for faster checkout next time.
        </p>
      </div>
    );
  }

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20">
      <CreditCard size={15} className="text-green-400 shrink-0" />

      <p className="flex-1 text-xs sm:text-sm text-foreground/80 leading-snug">
        <span className="font-semibold text-green-400">Save a card — </span>
        speed up future purchases. No charge added.
      </p>

      {status === 'error' && (
        <span className="text-xs text-destructive shrink-0 truncate max-w-[120px]">{errorMsg || 'Failed.'}</span>
      )}

      <button
        onClick={handleConnect}
        disabled={status === 'opening' || status === 'verifying'}
        className="shrink-0 h-8 px-3 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {status === 'opening' ? (
          <><Loader2 size={11} className="animate-spin" /> Opening…</>
        ) : status === 'verifying' ? (
          <><Loader2 size={11} className="animate-spin" /> Saving…</>
        ) : status === 'error' ? (
          'Try again'
        ) : (
          <><CreditCard size={11} /> Add Card</>
        )}
      </button>

      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-green-400/50 hover:text-green-400 transition-colors"
        title="Dismiss for this session"
      >
        <X size={13} />
      </button>
    </div>
  );
}
