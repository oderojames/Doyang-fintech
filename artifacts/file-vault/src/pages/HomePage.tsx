import { useLocation } from 'wouter';

export default function HomePage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(hsl(220_15%_10%/0.8)_1px,transparent_1px),linear-gradient(90deg,hsl(220_15%_10%/0.8)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 pointer-events-none" />

      {/* Glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg flex flex-col items-center gap-10">

        {/* Brand */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/20 border border-primary/30 mb-6 shadow-lg shadow-primary/10">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M20 4L36 13V27L20 36L4 27V13L20 4Z" stroke="hsl(var(--primary))" strokeWidth="2" fill="hsl(var(--primary)/0.15)" strokeLinejoin="round"/>
              <path d="M20 12L28 17V23L20 28L12 23V17L20 12Z" fill="hsl(var(--primary))" opacity="0.6"/>
            </svg>
          </div>
          <p className="text-sm font-semibold tracking-[0.2em] uppercase text-primary mb-2">Welcome to</p>
          <h1 className="text-5xl font-extrabold tracking-tight text-foreground">Doyang</h1>
          <p className="text-muted-foreground mt-3 text-base">Creditworthiness Platform</p>
        </div>

        {/* Portal selection */}
        <div className="w-full flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground font-medium">Select your portal to continue</p>

          {/* Retailer card */}
          <button
            onClick={() => navigate('/retailer')}
            className="group w-full bg-card border border-border hover:border-primary/50 hover:bg-primary/5 rounded-2xl p-6 text-left transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-primary/10 active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h2 className="text-base font-bold text-foreground">Retailer Portal</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Assess credit to grow</p>
              </div>
              <svg className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </button>

          {/* Wholesaler card */}
          <button
            onClick={() => navigate('/wholesaler')}
            className="group w-full bg-card border border-border hover:border-secondary/50 hover:bg-secondary/5 rounded-2xl p-6 text-left transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h2 className="text-base font-bold text-foreground">Wholesaler Portal</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Manage bulk credit assessments & reports</p>
              </div>
              <svg className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-200" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </button>

          {/* Buyer card */}
          <button
            onClick={() => navigate('/buyer')}
            className="group w-full bg-card border border-border hover:border-green-500/50 hover:bg-green-500/5 rounded-2xl p-6 text-left transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-green-500/10 active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h2 className="text-base font-bold text-foreground">Buyer Portal</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Browse verified sellers & credit reports</p>
              </div>
              <svg className="text-muted-foreground group-hover:text-green-400 group-hover:translate-x-1 transition-all duration-200" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </button>
        </div>

        <p className="text-xs text-muted-foreground">Doyang © {new Date().getFullYear()} · All rights reserved</p>
        <p className="text-xs text-muted-foreground mt-1"><a href="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</a> · <a href="/terms" className="hover:text-foreground hover:underline">Terms of Use</a></p>
      </div>
    </div>
  );
}
