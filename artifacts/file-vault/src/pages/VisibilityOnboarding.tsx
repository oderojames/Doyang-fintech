import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldCheck, Globe, Building2, Users2, Search, CheckSquare, Square, Loader2, ChevronRight } from 'lucide-react';

interface Wholesaler {
  uid: string;
  businessName: string;
  email: string;
}

interface Props {
  uid: string;
  isEditing?: boolean;
  initialOption?: 'public' | 'private' | 'sameBusiness';
  initialSelected?: string[];
  retailerBusinessType?: string;
  onComplete: (pref: 'public' | 'private' | 'sameBusiness', allowedWholesalers: string[]) => void;
}

export default function VisibilityOnboarding({
  uid,
  isEditing = false,
  initialOption,
  initialSelected = [],
  retailerBusinessType = '',
  onComplete,
}: Props) {
  const [option, setOption] = useState<'public' | 'private' | 'sameBusiness' | null>(initialOption ?? null);
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [loadingWs, setLoadingWs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (option === 'private') {
      setLoadingWs(true);
      getDocs(collection(db, 'wholesalers'))
        .then(snap => {
          setWholesalers(snap.docs.map(d => d.data() as Wholesaler));
        })
        .catch(() => {})
        .finally(() => setLoadingWs(false));
    }
  }, [option]);

  useEffect(() => {
    if (isEditing && initialOption === 'private') {
      setSelected(new Set(initialSelected));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const filtered = wholesalers.filter(w => {
    const q = search.toLowerCase();
    return w.businessName.toLowerCase().includes(q) || w.email.toLowerCase().includes(q);
  });

  const toggle = (uid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!option) return;
    setSaving(true);
    try {
      const allowedList = option === 'private' ? Array.from(selected) : [];
      await updateDoc(doc(db, 'users', uid), {
        visibilityPreference: option,
        allowedWholesalers: allowedList,
      });
      onComplete(option, allowedList);
    } catch {
      setSaving(false);
    }
  };

  const canConfirm =
    option === 'public' ||
    option === 'sameBusiness' ||
    (option === 'private' && selected.size > 0);

  const optionCard = (
    value: 'public' | 'private' | 'sameBusiness',
    icon: React.ReactNode,
    activeIcon: React.ReactNode,
    title: string,
    description: string,
    extra?: React.ReactNode,
  ) => (
    <button
      onClick={() => setOption(value)}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
        option === value
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          option === value ? 'bg-primary/25 border border-primary/40' : 'bg-muted border border-border'
        }`}>
          {option === value ? activeIcon : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm text-foreground">{title}</p>
            {option === value && (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
          {extra}
        </div>
      </div>
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start sm:justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg py-4">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 mb-4">
            <ShieldCheck size={28} className="text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            {isEditing ? 'Update sharing settings' : 'Who can see your trust score?'}
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            {isEditing
              ? 'Your change will apply to all your existing and future reports immediately.'
              : 'Choose how your credit reports are shared with wholesalers on Doyang.'}
          </p>
        </div>

        <div className="space-y-3 mb-6">

          {optionCard(
            'public',
            <Globe size={20} className="text-muted-foreground" />,
            <Globe size={20} className="text-primary" />,
            'Available to all wholesalers',
            'Any wholesaler using Doyang can view your trust score on their dashboard.',
          )}

          {optionCard(
            'sameBusiness',
            <Users2 size={20} className="text-muted-foreground" />,
            <Users2 size={20} className="text-primary" />,
            'Wholesalers in my business type',
            retailerBusinessType
              ? `Only wholesalers in "${retailerBusinessType}" can view your credit reports.`
              : 'Only wholesalers registered in the same business field as you can view your reports.',
          )}

          {optionCard(
            'private',
            <Building2 size={20} className="text-muted-foreground" />,
            <Building2 size={20} className="text-primary" />,
            'Share with specific wholesalers',
            'Only wholesalers you choose can see your credit reports.',
          )}
        </div>

        {option === 'private' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search wholesalers by business name…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-background text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto">
              {loadingWs ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Loading wholesalers…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {search ? 'No wholesalers match your search.' : 'No wholesalers registered yet.'}
                </div>
              ) : (
                filtered.map(w => (
                  <button
                    key={w.uid}
                    onClick={() => toggle(w.uid)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border last:border-0 text-left"
                  >
                    <div className="shrink-0 text-primary">
                      {selected.has(w.uid)
                        ? <CheckSquare size={16} className="text-primary" />
                        : <Square size={16} className="text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{w.businessName || '(Unnamed)'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{w.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {selected.size > 0 && (
              <div className="px-4 py-2 border-t border-border bg-primary/5 text-xs text-primary font-medium">
                {selected.size} wholesaler{selected.size !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>
        )}

        <Button
          onClick={handleConfirm}
          disabled={!canConfirm || saving}
          className="w-full font-semibold gap-2"
          size="lg"
        >
          {saving ? (
            <><Loader2 size={16} className="animate-spin" /> Saving…</>
          ) : isEditing ? (
            <>Save Changes <ChevronRight size={16} /></>
          ) : (
            <>Confirm & Continue <ChevronRight size={16} /></>
          )}
        </Button>

        {option === 'private' && selected.size === 0 && !loadingWs && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Select at least one wholesaler to continue.
          </p>
        )}

        <p className="text-xs text-muted-foreground text-center mt-4">
          You can change this setting anytime from the vault sidebar.
        </p>
      </div>
    </div>
  );
}
