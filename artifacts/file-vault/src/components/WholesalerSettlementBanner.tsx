import { useState } from 'react';
import { AlertTriangle, X, Landmark } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import WholesalerSettlementOnboarding from './WholesalerSettlementOnboarding';

export default function WholesalerSettlementBanner() {
  const { user, settlementConnected, markSettlementConnected } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  if (!user || user.role !== 'wholesaler' || settlementConnected !== false || dismissed) {
    return null;
  }

  return (
    <>
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
        <AlertTriangle size={15} className="text-amber-400 shrink-0" />

        <p className="flex-1 text-xs sm:text-sm text-foreground/80 leading-snug">
          <span className="font-semibold text-amber-400">Action required — </span>
          add your bank account so Doyang can settle loan repayments to you.
        </p>

        <button
          onClick={() => setShowModal(true)}
          className="shrink-0 h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <Landmark size={11} />
          Complete Setup
        </button>

        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-amber-400/50 hover:text-amber-400 transition-colors"
          title="Dismiss for this session"
        >
          <X size={13} />
        </button>
      </div>

      {showModal && (
        <WholesalerSettlementOnboarding
          onComplete={() => {
            setShowModal(false);
            if (settlementConnected) setDismissed(true);
            markSettlementConnected();
          }}
        />
      )}
    </>
  );
}
