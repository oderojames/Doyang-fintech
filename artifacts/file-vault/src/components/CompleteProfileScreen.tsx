import { useState } from 'react';
import { useLocation } from 'wouter';
import { ShieldCheck, Building2, User, Tag, AlertCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { BUSINESS_TYPES } from '@/lib/businessTypes';

export default function CompleteProfileScreen({ role }: { role: 'retailer' | 'wholesaler' }) {
  const [, navigate] = useLocation();
  const { user, completeProfile, signOut } = useAuth();
  const [name, setName] = useState(user?.displayName ?? '');
  const [businessType, setBusinessType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWholesaler = role === 'wholesaler';
  const accentText = isWholesaler ? 'text-amber-400' : 'text-primary';
  const accentBg = isWholesaler ? 'bg-amber-500/20 border-amber-500/30' : 'bg-primary/20 border-primary/30';
  const pillBg = isWholesaler ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-primary/10 border-primary/25 text-primary';
  const dot = isWholesaler ? 'bg-amber-400' : 'bg-primary';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Please enter your business name.'); return; }
    if (!businessType) { setError('Please select a business type.'); return; }
    setLoading(true);
    try {
      await completeProfile(role, businessType, name.trim());
    } catch {
      setError('Could not finish setting up your account. Please try again.');
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    await signOut();
    navigate(isWholesaler ? '/wholesaler' : '/retailer');
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
      {isWholesaler && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      )}

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl border mb-4 ${accentBg}`}>
            {isWholesaler ? <Building2 size={28} className={accentText} /> : <ShieldCheck size={28} className={accentText} />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Finish creating your account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signed in as <span className="font-semibold text-foreground">{user?.email}</span>
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${pillBg}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${dot}`} />
              {isWholesaler ? 'Wholesaler Portal' : 'Retailer Portal'}
            </span>
          </div>

          <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
            Just a couple of details to set up your {isWholesaler ? 'wholesaler' : 'retailer'} account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Business name" value={name} onChange={e => setName(e.target.value)}
                className="pl-9 bg-background" required />
            </div>

            <div className="relative">
              <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
              <select
                value={businessType}
                onChange={e => setBusinessType(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background appearance-none"
              >
                <option value="">Select business type…</option>
                {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm px-3 py-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className={`w-full font-semibold ${isWholesaler ? 'bg-amber-500 hover:bg-amber-400 text-black border-0' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className={`w-4 h-4 border-2 ${isWholesaler ? 'border-black/40' : 'border-white'} border-t-transparent rounded-full animate-spin`} />
                  Creating account…
                </span>
              ) : `Create ${isWholesaler ? 'Wholesaler' : 'Retailer'} Account`}
            </Button>
          </form>

          <p className="text-[11px] text-muted-foreground text-center mt-4 leading-relaxed">
            By creating an account you agree to our terms. Your M-Pesa statements are never stored — only the analysis report is saved.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 mt-6">
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={12} />
            Cancel and sign out
          </button>
        </div>
      </div>
    </div>
  );
}
