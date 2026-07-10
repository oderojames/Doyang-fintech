import { useState, useEffect, useRef } from 'react';
import {
  Store, RefreshCw, X, Upload, Clock, CheckCircle2, Star, CreditCard, FileUp, XCircle,
  Plus, Package, ClipboardList, AlertCircle, Trash2, ShoppingBag, ImagePlus, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auth } from '@/lib/firebase';
import { getQuestionsForBusinessType, buildDescription } from '@/lib/categoryQuestions';

function scoreColor(score: number) {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#3b82f6';
  if (score >= 55) return '#f59e0b';
  if (score >= 40) return '#ef4444';
  return '#7c3aed';
}

function fmtKes(n: number) {
  return `KES ${(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface SellerVerificationSuccessDialogProps {
  onContinue: () => void;
}

export function SellerVerificationSuccessDialog({ onContinue }: SellerVerificationSuccessDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-green-500/20 border border-green-500/30">
              <CheckCircle2 size={20} className="text-green-400" />
            </div>
          </div>
          <h2 className="text-base font-bold text-foreground mb-2">
            Seller Verification Successful
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your Seller Profile has been verified successfully.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            Your latest Trust Score is now visible to buyers.
          </p>
        </div>
        <div className="px-6 pb-6">
          <Button className="w-full gap-2 font-semibold" onClick={onContinue}>
            <Store size={14} />
            Continue to Seller Mode
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SellerVerificationFailedDialogProps {
  onUpload: () => void;
}

export function SellerVerificationFailedDialog({ onUpload }: SellerVerificationFailedDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-red-500/20 border border-red-500/30">
              <XCircle size={20} className="text-red-400" />
            </div>
          </div>
          <h2 className="text-base font-bold text-foreground mb-2">
            Seller Verification Failed
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We couldn't verify your Seller Profile.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            Please upload the latest M-PESA statement so as to get your current data.
          </p>
        </div>
        <div className="px-6 pb-6">
          <Button className="w-full gap-2 font-semibold" onClick={onUpload}>
            <Upload size={14} />
            Upload Another Statement
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CardConnectedSuccessDialogProps {
  onUpload: () => void;
  onLater: () => void;
}

export function CardConnectedSuccessDialog({ onUpload, onLater }: CardConnectedSuccessDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-green-500/20 border border-green-500/30">
              <CheckCircle2 size={20} className="text-green-400" />
            </div>
          </div>
          <h2 className="text-base font-bold text-foreground mb-2">
            Card Connected Successfully
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your GlobalPay card has been connected successfully.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            Please upload your latest M-PESA statement (generated within the last 30 days) to complete Seller Verification.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            Your uploaded statement will also be used to securely verify your marketplace settlement wallet.
          </p>
        </div>
        <div className="px-6 pb-6 space-y-2">
          <Button className="w-full gap-2 font-semibold" onClick={onUpload}>
            <FileUp size={14} />
            Upload M-PESA Statement
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={onLater}
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SellerCardRequiredDialogProps {
  onConnect: () => void;
  onSkip: () => void;
  onCancel: () => void;
}

export function SellerCardRequiredDialog({ onConnect, onSkip, onCancel }: SellerCardRequiredDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/20 border border-amber-500/30">
              <CreditCard size={20} className="text-amber-400" />
            </div>
            <button
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <h2 className="text-base font-bold text-foreground mb-2">
            Connect Your GlobalPay Card
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your GlobalPay card has not been connected yet. You may still upload your M-PESA statement, but your Seller Profile cannot become Verified until your GlobalPay card has been connected.
          </p>
        </div>
        <div className="px-6 pb-6 space-y-2">
          <Button className="w-full gap-2 font-semibold" onClick={onConnect}>
            <CreditCard size={14} />
            Connect GlobalPay Card
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={onSkip}
          >
            Skip and Upload Statement
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SellerModeGateDialogProps {
  mode: 'never' | 'expired';
  onUpload: () => void;
  onCancel: () => void;
}

export function SellerModeGateDialog({ mode, onUpload, onCancel }: SellerModeGateDialogProps) {
  const isNever = mode === 'never';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isNever ? 'bg-primary/20 border border-primary/30' : 'bg-amber-500/20 border border-amber-500/30'}`}>
              {isNever
                ? <Store size={20} className="text-primary" />
                : <RefreshCw size={20} className="text-amber-400" />}
            </div>
            <button
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <h2 className="text-base font-bold text-foreground mb-2">
            {isNever ? 'Become a Verified Seller' : 'Refresh Your Trust Score'}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isNever
              ? 'Upload your latest M-PESA statement to verify that you are a seller. After successful verification, your Seller Profile will be activated and your Trust Score will be displayed publicly to buyers to increase confidence in your business.'
              : 'Upload your latest up to date M-PESA statement (generated within the last 30 days) to refresh your Trust Score.'}
          </p>
        </div>
        <div className="px-6 pb-6 space-y-2">
          <Button
            className={`w-full gap-2 font-semibold ${isNever ? '' : 'bg-amber-500 hover:bg-amber-400 text-black'}`}
            onClick={onUpload}
          >
            <Upload size={14} />
            Upload M-PESA Statement
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SellerModeBlankViewProps {
  onClose: () => void;
}

export function SellerModeBlankView({ onClose }: SellerModeBlankViewProps) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Store size={16} className="text-green-400" />
          <span className="font-bold text-sm tracking-wide text-foreground">SELLER MODE</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} className="text-green-400" />
          </div>
          <p className="text-base font-semibold text-foreground mb-1">Seller Profile Active</p>
          <p className="text-sm text-muted-foreground">Your seller page is being set up.</p>
        </div>
      </div>
    </div>
  );
}

interface SellerProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  status: string;
  createdAt: string;
}

interface SellerOrder {
  id: string;
  productTitle: string;
  buyerPhone: string;
  buyerEmail: string;
  amount: number;
  sellerAmount: number;
  status: string;
  transferStatus?: string;
  createdAt: string;
}

interface PhotoEntry {
  id: string;
  localUrl: string;
  remoteUrl: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
}

interface PostProductFormProps {
  sellerId: string;
  businessType: string;
  onSuccess: () => void;
  onCancel: () => void;
}


function PostProductForm({ sellerId, businessType, onSuccess, onCancel }: PostProductFormProps) {
  const questions = getQuestionsForBusinessType(businessType);
  const [title, setTitle] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hpEnabled, setHpEnabled] = useState(false);
  const [hpDeposit, setHpDeposit] = useState('');
  const [hpInstallments, setHpInstallments] = useState('');
  const [hpInstallmentAmount, setHpInstallmentAmount] = useState('');
  const [hpIntervalDays, setHpIntervalDays] = useState('30');

  const removePhoto = (id: string) => setPhotos(prev => prev.filter(p => p.id !== id));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    const invalid = files.find(f => !allowed.includes(f.type));
    if (invalid) {
      setError('Only PNG or JPG images are accepted.');
      return;
    }
    setError(null);

    for (const file of files) {
      const id = `${Date.now()}-${Math.random()}`;
      const localUrl = URL.createObjectURL(file);
      setPhotos(prev => [...prev, { id, localUrl, remoteUrl: null, uploading: true, progress: 0, error: null }]);

      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;

        const formData = new FormData();
        formData.append('image', file);

        const remoteUrl = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload-image');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              const pct = Math.round((ev.loaded / ev.total) * 100);
              setPhotos(prev => prev.map(p => p.id === id ? { ...p, progress: pct } : p));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText) as { success?: boolean; url?: string; error?: string };
                if (data.success && data.url) resolve(data.url);
                else reject(new Error(data.error ?? 'Upload failed'));
              } catch { reject(new Error('Invalid server response')); }
            } else {
              try {
                const data = JSON.parse(xhr.responseText) as { error?: string };
                reject(new Error(data.error ?? `HTTP ${xhr.status}`));
              } catch { reject(new Error(`HTTP ${xhr.status}`)); }
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(formData);
        });

        setPhotos(prev => prev.map(p => p.id === id ? { ...p, remoteUrl, uploading: false, progress: 100 } : p));
      } catch (err) {
        console.error('[upload]', err);
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, uploading: false, error: 'Upload failed' } : p));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !price || Number(price) <= 0 || !quantity) {
      setError('Please fill in all required fields with valid values.');
      return;
    }
    const requiredUnfilled = questions.filter(q => q.required && !answers[q.key]?.trim());
    if (requiredUnfilled.length > 0) {
      setError(`Please fill in: ${requiredUnfilled.map(q => q.label).join(', ')}`);
      return;
    }
    const description = buildDescription(businessType, answers);
    if (!description) {
      setError('Please fill in at least one product detail.');
      return;
    }
    if (photos.length === 0) {
      setError('At least one product photo is required.');
      return;
    }
    if (photos.some(p => p.uploading)) {
      setError('Please wait for all photos to finish uploading.');
      return;
    }
    const imageUrls = photos.filter(p => p.remoteUrl).map(p => p.remoteUrl!);
    if (imageUrls.length === 0) {
      setError('All photo uploads failed. Please remove them and try again.');
      return;
    }
    if (hpEnabled) {
      if (!hpDeposit || Number(hpDeposit) < 10) {
        setError('HP deposit must be at least KES 10.');
        return;
      }
      if (!hpInstallments || !Number.isInteger(Number(hpInstallments)) || Number(hpInstallments) < 1) {
        setError('Number of installments must be a positive whole number.');
        return;
      }
      if (!hpInstallmentAmount || Number(hpInstallmentAmount) < 10) {
        setError('Per-installment amount must be at least KES 10.');
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          description,
          category: businessType,
          price: Number(price),
          quantity: Math.max(1, Math.floor(Number(quantity))),
          imageUrl: imageUrls[0],
          imageUrls,
          hpEnabled,
          ...(hpEnabled ? {
            hpDeposit: Number(hpDeposit),
            hpInstallments: Math.floor(Number(hpInstallments)),
            hpInstallmentAmount: Number(hpInstallmentAmount),
            hpIntervalDays: Number(hpIntervalDays) || 30,
          } : {}),
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!data.success) {
        setError(data.error || 'Failed to post product. Please try again.');
        return;
      }
      onSuccess();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Plus size={14} className="text-primary" />
            </div>
            <h2 className="text-sm font-bold text-foreground">Post a Product</h2>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">
              Product Title <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder=""
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-background"
              required
              maxLength={120}
            />
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg">
            <span className="text-[10px] text-muted-foreground">Category:</span>
            <span className="text-xs font-semibold text-primary">{businessType || 'General Trading'}</span>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-foreground">Product Details <span className="text-destructive">*</span></p>
            {questions.map(q => (
              <div key={q.key}>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  {q.label}{q.required && <span className="text-destructive ml-0.5">*</span>}
                </label>
                <Input
                  placeholder=""
                  value={answers[q.key] ?? ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                  className="bg-background text-sm"
                  maxLength={200}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Price (KES) <span className="text-destructive">*</span>
              </label>
              <Input
                type="number"
                placeholder=""
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="bg-background"
                required
                min="1"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Quantity <span className="text-destructive">*</span>
              </label>
              <Input
                type="number"
                placeholder=""
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="bg-background"
                required
                min="1"
                step="1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">
              Product Photos <span className="text-destructive">*</span>
              <span className="text-muted-foreground font-normal ml-1">(PNG or JPG · one or more)</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {photos.length > 0 ? (
              <div className="mt-1 grid grid-cols-3 gap-2">
                {photos.map(photo => (
                  <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                    <img src={photo.localUrl} alt="" className="w-full h-full object-cover" />
                    {photo.uploading && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5">
                        <div className="w-10 h-1 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${photo.progress}%` }} />
                        </div>
                        <p className="text-[10px] text-white/70">{photo.progress}%</p>
                      </div>
                    )}
                    {photo.error && (
                      <div className="absolute inset-0 bg-destructive/80 flex items-center justify-center px-1">
                        <p className="text-[10px] text-white text-center leading-tight">Upload failed</p>
                      </div>
                    )}
                    {!photo.uploading && !photo.error && photo.remoteUrl && (
                      <div className="absolute top-1 left-1">
                        <span className="bg-green-500/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full">✓</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 transition-colors"
                >
                  <ImagePlus size={16} className="text-primary" />
                  <p className="text-[10px] text-muted-foreground">Add more</p>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 w-full h-28 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <ImagePlus size={18} className="text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-foreground">Click to upload photos</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">PNG or JPG · one or more</p>
                </div>
              </button>
            )}
          </div>

          {/* ── Hire Purchase ───────────────────────────────────────────── */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <CreditCard size={13} className="text-primary" />
                  Hire Purchase
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Let buyers pay in installments</p>
              </div>
              <button
                type="button"
                onClick={() => setHpEnabled(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${hpEnabled ? 'bg-primary' : 'bg-border'}`}
                aria-pressed={hpEnabled}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${hpEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {hpEnabled && (
              <div className="space-y-3 pt-1 border-t border-border">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Deposit Amount (KES) <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="number"
                    placeholder=""
                    value={hpDeposit}
                    onChange={e => setHpDeposit(e.target.value)}
                    className="bg-background text-sm"
                    min="10"
                    step="1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      No. of Installments <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="number"
                      placeholder=""
                      value={hpInstallments}
                      onChange={e => setHpInstallments(e.target.value)}
                      className="bg-background text-sm"
                      min="1"
                      step="1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Per Installment (KES) <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="number"
                      placeholder=""
                      value={hpInstallmentAmount}
                      onChange={e => setHpInstallmentAmount(e.target.value)}
                      className="bg-background text-sm"
                      min="10"
                      step="1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    <Clock size={10} className="inline mr-0.5" />
                    Days between installments
                  </label>
                  <Input
                    type="number"
                    placeholder=""
                    value={hpIntervalDays}
                    onChange={e => setHpIntervalDays(e.target.value)}
                    className="bg-background text-sm"
                    min="1"
                    step="1"
                  />
                </div>
                {hpDeposit && hpInstallments && hpInstallmentAmount && (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-xs space-y-1.5">
                    <p className="font-semibold text-primary">Plan Summary</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deposit</span>
                      <span className="font-medium text-foreground">KES {Number(hpDeposit).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{hpInstallments} installments</span>
                      <span className="font-medium text-foreground">KES {Number(hpInstallmentAmount).toLocaleString()} each</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frequency</span>
                      <span className="font-medium text-foreground">Every {hpIntervalDays || 30} days</span>
                    </div>
                    <div className="flex justify-between border-t border-primary/20 pt-1">
                      <span className="text-muted-foreground font-medium">Total</span>
                      <span className="font-bold text-foreground">
                        KES {(Number(hpDeposit) + Number(hpInstallments) * Number(hpInstallmentAmount)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-snug">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 gap-2 font-semibold" disabled={submitting}>
              {submitting ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Publishing…</>
              ) : (
                <><Plus size={14} /> Publish Product</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SellerModeViewProps {
  score: number;
  grade: string;
  label: string;
  businessName: string;
  businessType: string;
  lastStatementAt: string;
  sellerId: string;
  sellerEmail: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function SellerModeView({
  score, grade, label, businessName, businessType, lastStatementAt, sellerId, onClose, onRefresh,
}: SellerModeViewProps) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 52;
  const dash = (score / 100) * circumference;

  const daysElapsed = Math.floor(
    (Date.now() - new Date(lastStatementAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysRemaining = Math.max(0, 30 - daysElapsed);
  const isExpiring = daysRemaining <= 7;
  const expiryDate = new Date(
    new Date(lastStatementAt).getTime() + 30 * 24 * 60 * 60 * 1000
  ).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  interface HpRepayment { installmentNumber: number; amount: number; dueDate: string; status: string; paidAt?: string | null; }
  interface HpSellerOrder {
    id: string; buyerId: string; productId: string; productTitle: string;
    depositAmount: number; installments: number; installmentAmount: number;
    intervalDays: number; installmentsPaid: number; status: string; createdAt: string;
    repayments: HpRepayment[];
  }

  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [hpOrders, setHpOrders] = useState<HpSellerOrder[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingHpOrders, setLoadingHpOrders] = useState(true);
  const [showPostForm, setShowPostForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchHpOrders = async () => {
    setLoadingHpOrders(true);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
      const r = await fetch('/api/hp/orders', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await r.json() as { success?: boolean; orders?: HpSellerOrder[] };
      if (data.success) setHpOrders((data.orders ?? []).filter(o => o.buyerId !== sellerId));
    } catch { /* silent */ }
    finally { setLoadingHpOrders(false); }
  };

  const fetchMyProducts = async () => {
    setLoadingProducts(true);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
      const r = await fetch(`/api/products/seller/${encodeURIComponent(sellerId)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const data = await r.json() as { products: SellerProduct[] };
      setProducts(data.products || []);
    } catch {
      // silent
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchMyOrders = async () => {
    setLoadingOrders(true);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
      const r = await fetch(`/api/orders/seller/${encodeURIComponent(sellerId)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const data = await r.json() as { orders: SellerOrder[] };
      setOrders(data.orders || []);
    } catch {
      // silent
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchMyProducts();
    fetchMyOrders();
    fetchHpOrders();
  }, [sellerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (productId: string) => {
    setDeletingId(productId);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null) ?? null;
      await fetch(`/api/products/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
      setProducts(prev => prev.filter(p => p.id !== productId));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  const activeProducts = products.filter(p => p.status === 'published');
  const removedProducts = products.filter(p => p.status !== 'published' && p.status !== 'sold_out');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Store size={15} className="text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide">SELLER MODE</h1>
            <p className="text-[10px] text-muted-foreground">Your Public Seller Profile</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-xl w-fit">
          <CheckCircle2 size={13} className="text-green-400" />
          <span className="text-xs font-semibold text-green-400">Verified Seller</span>
        </div>

        {/* Trust Score */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-5">Trust Score</h2>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex flex-col items-center gap-2 shrink-0">
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
            <div className="flex-1 space-y-3 text-center sm:text-left">
              <div>
                <p className="text-xl font-bold text-foreground">{businessName}</p>
                {businessType && (
                  <p className="text-sm text-muted-foreground mt-0.5">{businessType} Business</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <div
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold"
                  style={{ background: color + '20', borderColor: color + '50', color }}
                >
                  Grade {grade} · {label}
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your Trust Score is publicly visible to all buyers and wholesalers on the Doyang platform.
              </p>
            </div>
          </div>
        </div>

        {/* Statement validity */}
        <div className={`bg-card border rounded-xl p-4 flex items-center gap-4 ${isExpiring ? 'border-amber-500/40' : 'border-border'}`}>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isExpiring ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-primary/15 border border-primary/25'}`}>
            <Clock size={16} className={isExpiring ? 'text-amber-400' : 'text-primary'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">
              {isExpiring
                ? daysRemaining === 0
                  ? 'Statement expires today'
                  : `Expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
                : `Valid for ${daysRemaining} more day${daysRemaining === 1 ? '' : 's'}`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Statement valid until {expiryDate}</p>
          </div>
          {isExpiring && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
              onClick={onRefresh}
            >
              Refresh
            </Button>
          )}
        </div>

        {/* What Buyers See */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Star size={13} className="text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What Buyers See</h3>
          </div>
          <div className="space-y-0">
            {[
              { label: 'Business Name', value: businessName },
              { label: 'Business Type', value: businessType || '—' },
              { label: 'Trust Score', value: `${score}/100 (${grade} · ${label})` },
            ].map(({ label: l, value }) => (
              <div key={l} className="flex items-center justify-between text-xs py-2.5 border-b border-border last:border-0">
                <span className="text-muted-foreground">{l}</span>
                <span className="font-medium text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Post Product CTA */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <ShoppingBag size={14} className="text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Marketplace Listings</p>
                <p className="text-[10px] text-muted-foreground">Post products for buyers to purchase</p>
              </div>
            </div>
            <Button
              size="sm"
              className="gap-1.5 text-xs font-semibold"
              onClick={() => setShowPostForm(true)}
            >
              <Plus size={13} />
              Post Product
            </Button>
          </div>
        </div>

        {/* My Listings */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package size={13} className="text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My Listings</h3>
            {!loadingProducts && (
              <span className="ml-auto text-[10px] text-muted-foreground">{activeProducts.length} active</span>
            )}
          </div>

          {loadingProducts ? (
            <div className="flex items-center justify-center py-6">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : products.filter(p => p.status !== 'removed').length === 0 ? (
            <div className="text-center py-6">
              <Package size={28} className="text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No products posted yet.</p>
              <button
                onClick={() => setShowPostForm(true)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Post your first product →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {products.filter(p => p.status !== 'removed').map(product => (
                <div key={product.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                  {product.imageUrl ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-muted">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package size={18} className="text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{product.title}</p>
                    <p className="text-[11px] text-primary font-bold mt-0.5">{fmtKes(product.price)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                        product.status === 'published'
                          ? 'bg-green-500/15 text-green-400'
                          : product.status === 'sold_out'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {product.status === 'published' ? `${product.quantity} left` : product.status === 'sold_out' ? 'Sold out' : product.status}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(product.id)}
                    disabled={deletingId === product.id}
                    className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 shrink-0 mt-0.5"
                    title="Remove listing"
                  >
                    {deletingId === product.id
                      ? <span className="w-3.5 h-3.5 border border-muted-foreground/50 border-t-transparent rounded-full animate-spin inline-block" />
                      : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Orders */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={13} className="text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Orders</h3>
            {!loadingOrders && orders.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {loadingOrders ? (
            <div className="flex items-center justify-center py-6">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-6">
              <ClipboardList size={28} className="text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No orders received yet.</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">Orders will appear here once buyers purchase your products.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map(order => (
                <div key={order.id} className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground leading-snug line-clamp-1">{order.productTitle}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-green-500/15 text-green-400 shrink-0">
                      {order.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      Buyer: {order.buyerPhone
                        ? order.buyerPhone.replace(/(\+254|0)(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4').replace(/(\d{3})(?=\d{3}$)/, '***')
                        : order.buyerEmail ? order.buyerEmail.split('@')[0].slice(0, 3) + '***' : 'Anonymous'}
                    </span>
                    <span className="font-bold text-primary">{fmtKes(order.sellerAmount)} <span className="font-normal text-muted-foreground">to you</span></span>
                  </div>
                  {order.transferStatus && order.transferStatus !== 'pending' && (
                    <p className="text-[10px] text-muted-foreground">
                      Settlement: {order.transferStatus === 'initiated' ? '✓ Transfer initiated' : order.transferStatus}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HP Orders */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={13} className="text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hire Purchase Orders</h3>
            {!loadingHpOrders && hpOrders.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">{hpOrders.length} order{hpOrders.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {loadingHpOrders ? (
            <div className="flex items-center justify-center py-6">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : hpOrders.length === 0 ? (
            <div className="text-center py-6">
              <Calendar size={28} className="text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No hire purchase orders yet.</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">Enable HP on your products so buyers can pay in installments.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {hpOrders.map(order => {
                const paid = order.repayments.filter(r => r.status === 'paid').length;
                const remaining = order.installments - paid;
                const nextDue = order.repayments.find(r => r.status === 'due' || r.status === 'upcoming');
                const sellerTotal = order.depositAmount * 0.9 + order.installmentAmount * order.installments * 0.9;
                return (
                  <div key={order.id} className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground line-clamp-1">{order.productTitle}</p>
                      <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                        order.status === 'active' ? 'bg-primary/15 text-primary' :
                        order.status === 'completed' ? 'bg-green-500/15 text-green-400' :
                        'bg-destructive/15 text-destructive'
                      }`}>
                        {order.status === 'active' ? 'Active' : order.status === 'completed' ? 'Completed' : 'Defaulted'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Installments</span>
                      <span className="font-semibold text-foreground">{paid}/{order.installments} paid</span>
                    </div>
                    {remaining > 0 && nextDue && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Next due</span>
                        <span className="font-semibold text-foreground">
                          {fmtKes(nextDue.amount)} · {new Date(nextDue.dueDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    )}
                    {order.repayments.length > 0 && (
                      <div className="flex gap-0.5">
                        {order.repayments.map(r => (
                          <div key={r.installmentNumber}
                            title={`Installment ${r.installmentNumber}: ${r.status}`}
                            className={`flex-1 h-1 rounded-full ${r.status === 'paid' ? 'bg-green-500' : r.status === 'failed' ? 'bg-destructive' : r.status === 'due' ? 'bg-amber-400' : 'bg-muted'}`}
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] pt-0.5 border-t border-border/50">
                      <span className="text-muted-foreground">Your total (90%)</span>
                      <span className="font-bold text-primary">{fmtKes(sellerTotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showPostForm && (
        <PostProductForm
          sellerId={sellerId}
          businessType={businessType}
          onSuccess={() => {
            setShowPostForm(false);
            fetchMyProducts();
          }}
          onCancel={() => setShowPostForm(false)}
        />
      )}
    </div>
  );
}
