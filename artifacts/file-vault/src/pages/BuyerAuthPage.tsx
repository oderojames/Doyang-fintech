import { useState } from 'react';
import { useLocation } from 'wouter';
import { ShoppingBag, Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'signin' | 'signup';

const friendlyError = (code: string) => {
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential'))
    return 'Incorrect email or password. Please check your details and try again.';
  if (code.includes('email-already-in-use'))
    return 'An account with this email already exists. Try signing in instead.';
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a few minutes and try again.';
  if (code.includes('network-request-failed') || code.includes('network')) return 'Network error. Please check your connection and try again.';
  if (code.includes('user-disabled')) return 'This account has been disabled. Please contact support.';
  if (code.includes('unauthorized-domain')) return 'Google sign-in is not yet enabled for this web address. Please contact support.';
  if (code.includes('operation-not-allowed')) return 'Google sign-in is not enabled for this app yet. Please contact support.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the Google sign-in window. Please allow pop-ups and try again.';
  if (code.includes('account-exists-with-different-credential')) return 'An account already exists with this email using a different sign-in method.';
  return 'Something went wrong. Please try again.';
};

export default function BuyerAuthPage() {
  const [, navigate] = useLocation();
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signOut, sendPasswordReset } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resetError, setResetError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { isNew, role } = await signInWithGoogle('buyer');
      if (!isNew && role !== 'buyer') {
        await signOut();
        navigate(role === 'wholesaler' ? '/wholesaler' : '/retailer');
        return;
      }
    } catch (e: any) {
      const code = e?.code ?? '';
      if (!code.includes('popup-closed') && !code.includes('cancelled-popup')) {
        setError(friendlyError(code));
      }
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setResetError('Enter your email address above first.');
      setResetStatus('error');
      return;
    }
    setResetStatus('sending');
    setResetError(null);
    try {
      await sendPasswordReset(email.trim());
      setResetStatus('sent');
    } catch (e: any) {
      setResetStatus('error');
      const code = e?.code ?? '';
      if (code.includes('user-not-found')) {
        setResetError('No account found with this email address.');
      } else if (code.includes('invalid-email')) {
        setResetError('Please enter a valid email address.');
      } else if (code.includes('too-many-requests')) {
        setResetError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setResetError('Could not send reset email. Please try again.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === 'signup') {
        if (!name.trim()) { setError('Please enter your name.'); setLoading(false); return; }
        await signUpWithEmail(name.trim(), email, password, 'buyer');
      } else {
        const { role } = await signInWithEmail(email, password);
        if (role !== 'buyer') {
          await signOut();
          navigate(role === 'wholesaler' ? '/wholesaler' : '/retailer');
          return;
        }
      }
    } catch (e: any) {
      setError(friendlyError(e.code ?? ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4">

      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/20 border border-green-500/30 mb-4">
            <ShoppingBag size={28} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Doyang</h1>
          <p className="text-sm text-muted-foreground mt-1">Buyer Portal · M-Pesa Creditworthiness</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">

          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/25 text-xs font-semibold text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Buyer Portal
            </span>
          </div>

          <div className="flex bg-muted rounded-lg p-1 mb-6">
            {(['signin', 'signup'] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(null); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'signup' && (
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Full name" value={name} onChange={e => setName(e.target.value)}
                  className="pl-9 bg-background" required />
              </div>
            )}
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="email" placeholder="Email address" value={email}
                onChange={e => setEmail(e.target.value)} className="pl-9 bg-background" required />
            </div>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type={showPwd ? 'text' : 'password'} placeholder="Password"
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                className="pl-9 pr-10 bg-background" required />
              <button type="button" onClick={() => setShowPwd(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {tab === 'signin' && (
              <div className="flex justify-end -mt-1">
                <button type="button" disabled={resetStatus === 'sending'} onClick={handleForgotPassword}
                  className="text-xs text-green-400 hover:underline disabled:opacity-50 transition-colors">
                  {resetStatus === 'sending' ? 'Sending…' : 'Forgot password?'}
                </button>
              </div>
            )}

            {tab === 'signin' && resetStatus === 'sent' && (
              <div className="flex flex-col gap-0.5 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
                <span className="font-semibold">Reset email sent!</span>
                <span className="text-xs text-emerald-400/80">Check your inbox. The link expires in 1 hour.</span>
              </div>
            )}

            {tab === 'signin' && resetStatus === 'error' && resetError && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full font-semibold bg-green-500 hover:bg-green-400 text-white border-0" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                  {tab === 'signup' ? 'Creating account…' : 'Signing in…'}
                </span>
              ) : tab === 'signup' ? 'Create Buyer Account' : 'Sign In'}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button type="button" onClick={handleGoogle} disabled={googleLoading || loading}
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-md border border-input bg-background hover:bg-muted text-foreground font-medium py-2.5 px-4 transition-colors text-sm disabled:opacity-60">
            {googleLoading ? (
              <span className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
            )}
            {googleLoading ? 'Connecting…' : 'Continue with Google'}
          </button>

          <p className="text-[11px] text-muted-foreground text-center mt-4 leading-relaxed">
            {tab === 'signup'
              ? 'By creating an account you agree to our terms of service.'
              : 'New Google users will be asked to complete a short account setup.'}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 mt-6">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back to home
          </button>
          <p className="text-xs text-muted-foreground">Doyang © {new Date().getFullYear()} · Buyer Portal</p>
        </div>
      </div>
    </div>
  );
}
