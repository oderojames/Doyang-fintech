import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X, Globe, Users2, Building2, Search, CheckSquare, Square, Loader2, ChevronRight, Share2,
} from 'lucide-react';

interface Wholesaler {
  uid: string;
  businessName: string;
  email: string;
}

interface Props {
  reportId: string;
  reportName: string;
  initialOption?: 'public' | 'private' | 'sameBusiness';
  initialSelected?: string[];
  retailerBusinessType?: string;
  onClose: () => void;
  onSaved: (visibility: 'public' | 'private' | 'sameBusiness', allowedWholesalers: string[]) => void;
}

export default function ReportShareModal({
  reportId,
  reportName,
  initialOption = 'public',
  initialSelected = [],
  retailerBusinessType = '',
  onClose,
  onSaved,
}: Props) {
  const [option, setOption] = useState<'public' | 'private' | 'sameBusiness'>(initialOption);
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [loadingWs, setLoadingWs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (option === 'private') {
      setLoadingWs(true);
      getDocs(collection(db, 'wholesalers'))
        .then(snap => setWholesalers(snap.docs.map(d => d.data() as Wholesaler)))
        .catch(() => {})
        .finally(() => setLoadingWs(false));
    }
  }, [option]);

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

  const canSave =
    option === 'public' ||
    option === 'sameBusiness' ||
    (option === 'private' && selected.size > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const allowedList = option === 'private' ? Array.from(selected) : [];
      await updateDoc(doc(db, 'retailer_reports', reportId), {
        visibility: option,
        allowedWholesalers: allowedList,
        businessType: retailerBusinessType,
      });
      onSaved(option, allowedList);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const OptionCard = ({
    value,
    icon,
    activeIcon,
    title,
    description,
  }: {
    value: 'public' | 'private' | 'sameBusiness';
    icon: React.ReactNode;
    activeIcon: React.ReactNode;
    title: string;
    description: string;
  }) => (
    <button
      onClick={() => setOption(value)}
      className={`w-full text-left rounded-xl border-2 p-3.5 transition-all ${
        option === value
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          option === value ? 'bg-primary/25 border border-primary/40' : 'bg-muted border border-border'
        }`}>
          {option === value ? activeIcon : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm text-foreground">{title}</p>
            {option === value && (
              <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0 ml-2">
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
            <Share2 size={17} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">Report Sharing</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{reportName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1 rounded-lg hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">

          <p className="text-xs text-muted-foreground pb-1">
            This setting applies only to this report and overrides your account default for it.
          </p>

          <OptionCard
            value="public"
            icon={<Globe size={18} className="text-muted-foreground" />}
            activeIcon={<Globe size={18} className="text-primary" />}
            title="Available to all wholesalers"
            description="Any wholesaler on Doyang can view this report."
          />
          <OptionCard
            value="sameBusiness"
            icon={<Users2 size={18} className="text-muted-foreground" />}
            activeIcon={<Users2 size={18} className="text-primary" />}
            title="Wholesalers in my business type"
            description={
              retailerBusinessType
                ? `Only wholesalers in "${retailerBusinessType}" can view this report.`
                : 'Only wholesalers in the same business field can view this report.'
            }
          />
          <OptionCard
            value="private"
            icon={<Building2 size={18} className="text-muted-foreground" />}
            activeIcon={<Building2 size={18} className="text-primary" />}
            title="Share with specific wholesalers"
            description="Only wholesalers you select below can view this report."
          />

          {/* Wholesaler picker */}
          {option === 'private' && (
            <div className="bg-background border border-border rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search wholesalers…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 bg-card text-sm h-8"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto">
                {loadingWs ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Loading wholesalers…</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {search ? 'No wholesalers match your search.' : 'No wholesalers registered yet.'}
                  </div>
                ) : (
                  filtered.map(w => (
                    <button
                      key={w.uid}
                      onClick={() => toggle(w.uid)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors border-b border-border last:border-0 text-left"
                    >
                      <div className="shrink-0">
                        {selected.has(w.uid)
                          ? <CheckSquare size={14} className="text-primary" />
                          : <Square size={14} className="text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{w.businessName || '(Unnamed)'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{w.email}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selected.size > 0 && (
                <div className="px-4 py-1.5 border-t border-border bg-primary/5 text-xs text-primary font-medium">
                  {selected.size} wholesaler{selected.size !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>
          )}

          {option === 'private' && selected.size === 0 && !loadingWs && (
            <p className="text-xs text-muted-foreground text-center">
              Select at least one wholesaler to save.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border shrink-0">
          <Button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full font-semibold gap-2"
            size="sm"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Saving…</>
            ) : (
              <>Save <ChevronRight size={14} /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
