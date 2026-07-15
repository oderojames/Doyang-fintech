import { useEffect, useRef, useState } from 'react';
import { Bot, X, Send, Loader2 } from 'lucide-react';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatbotProps {
  /** Friendly name of the current screen, e.g. "Retailer Portal". */
  screenName: string;
  /** Detailed description of the screen's features, sent to the assistant. */
  screenContext: string;
  /** Bullet list of features shown to the user the moment they open the chat. */
  features: string[];
}

export default function Chatbot({ screenName, screenContext, features }: ChatbotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build the intro message the first time the chat is opened.
  useEffect(() => {
    if (open && messages.length === 0) {
      const intro =
        `Hi! I'm the Doyang Assistant. 👋\n\nYou're on the **${screenName}**. Here's what you can do on this screen:\n\n` +
        features.map(f => `• ${f}`).join('\n') +
        `\n\nAsk me anything about these features — or anything else about Doyang.`;
      setMessages([{ role: 'assistant', content: intro }]);
    }
  }, [open, messages.length, screenName, features]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenContext,
          // Don't send the static intro to the model — start from real exchange.
          messages: next.filter((_, i) => i !== 0),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Request failed');
      }
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(m => [
        ...m,
        {
          role: 'assistant',
          content:
            "Sorry, I'm having trouble responding right now. Please try again, or call support on 0114458799 / 0721628310.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = (text: string) =>
    text.split('\n').map((line, i) => {
      // Render **bold** segments.
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <span key={i} className="block min-h-[2px]">
          {parts.map((p, j) =>
            p.startsWith('**') && p.endsWith('**') ? (
              <strong key={j} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{p}</span>
            ),
          )}
        </span>
      );
    });

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {open && (
        <div className="w-[330px] max-w-[calc(100vw-2.5rem)] h-[460px] max-h-[calc(100vh-7rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-primary/10 shrink-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary">
              <Bot size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">Doyang Assistant</p>
              <p className="text-[11px] text-muted-foreground truncate">Help with the {screenName}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-muted-foreground rounded-bl-sm'
                  }`}
                >
                  {renderContent(m.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted text-muted-foreground rounded-2xl rounded-bl-sm px-3 py-2.5">
                  <Loader2 size={14} className="animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-2.5 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Ask a question…"
                className="flex-1 resize-none max-h-24 rounded-xl border border-input bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                aria-label="Send message"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground shrink-0 disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/40 hover:scale-105 active:scale-95 transition-transform"
      >
        {!open && <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />}
        {open ? <X size={16} /> : <Bot size={16} className="relative" />}
      </button>
    </div>
  );
}
