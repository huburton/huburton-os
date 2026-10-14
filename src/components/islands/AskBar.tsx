import { useEffect, useRef, useState } from 'react';

interface Msg { role: 'user' | 'model'; text: string; }

export default function AskBar() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [thinking, setThinking] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [agentOk, setAgentOk] = useState<boolean | null>(null);
  const [historyState, setHistoryState] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/agent/status').then(r => r.json()).then(d => setAgentOk(d.ok)).catch(() => setAgentOk(false));
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement) return;
      if (document.activeElement instanceof HTMLTextAreaElement) return;
      // Alt+K pour ouvrir (Ctrl+K déjà pris par Zen)
      if (e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  async function send() {
    const text = prompt.trim();
    if (!text || thinking) return;
    setMsgs(m => [...m, { role: 'user', text }]);
    setPrompt('');
    setThinking(true);
    try {
      const r = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, history: historyState }),
      });
      const data = await r.json();
      if (data.error) {
        setMsgs(m => [...m, { role: 'model', text: `[ERREUR] ${data.error}` }]);
      } else {
        setMsgs(m => [...m, { role: 'model', text: data.reply || '(pas de réponse)' }]);
        setHistoryState(data.history || []);
        // Notifier les tâches d'éventuellement se recharger
        window.dispatchEvent(new CustomEvent('tasks:changed'));
      }
    } catch (e) {
      setMsgs(m => [...m, { role: 'model', text: `[ERREUR RÉSEAU] ${(e as Error).message}` }]);
    } finally { setThinking(false); }
  }

  return (
    <>
      {/* Toggle button bottom-right */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 z-[60] brutal-border bg-[var(--color-fg)] text-[var(--color-bg)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-[var(--color-acc-red)] shadow-[3px_3px_0_0_var(--color-fg)] anim-fade-in"
        aria-label="Open Ask Hub"
        style={{ display: open ? 'none' : 'block' }}
      >
        ⌘ ASK · ⌥K
      </button>

      {open && (
        <>
          <div className="modal-overlay" onClick={() => setOpen(false)} />
          <aside className="fixed inset-x-0 bottom-0 z-[110] brutal-border-bottom bg-[var(--color-bg-elev)] border-t-[1.5px] border-[var(--color-border)] flex flex-col" style={{ maxHeight: '70vh', animation: 'slideUp 240ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <header className="px-4 py-2 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-section">⌘ ASK HUB</span>
                <span className={`font-mono text-[9px] uppercase tracking-wider ${agentOk ? 'text-[var(--color-acc-green)]' : 'text-[var(--color-acc-red)]'}`}>
                  {agentOk === null ? '…' : agentOk ? '● GEMINI OK' : '● GEMINI MISSING KEY'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {msgs.length > 0 && <button onClick={() => { setMsgs([]); setHistoryState([]); }} className="font-mono text-[10px] uppercase tracking-wider hover-paper px-2 py-[2px]">CLEAR</button>}
                <button onClick={() => setOpen(false)} className="font-mono text-[14px] leading-none hover:text-[var(--color-acc-red)]">✕</button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3 min-h-[120px]">
              {msgs.length === 0 ? (
                <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center py-6">
                  → POSE UNE QUESTION OU DEMANDE UNE ACTION
                  <br/><br/>
                  <span className="text-[var(--color-fg-muted)] normal-case">
                    Exemples : "ajoute une tâche : appeler le plombier demain medium" · "qu'est-ce qui est dû la semaine prochaine ?" · "crée un event vendredi 18h dîner" · "où en est le projet GARDEN ?"
                  </span>
                </div>
              ) : msgs.map((m, i) => (
                <div key={i} className={`mb-3 ${m.role === 'user' ? 'text-right' : ''}`}>
                  <div className={`inline-block max-w-[80%] brutal-border-soft px-3 py-2 ${m.role === 'user' ? 'bg-[var(--color-bg-soft)]' : 'bg-[var(--color-bg-paper)]'}`}>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] mb-1">{m.role === 'user' ? 'YOU' : 'GEMINI'}</div>
                    <div className="font-sans text-[13px] whitespace-pre-wrap leading-[1.5]">{m.text}</div>
                  </div>
                </div>
              ))}
              {thinking && <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">→ THINKING…</div>}
            </div>

            <form
              className="px-4 py-3 border-t-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-soft)] flex items-center gap-2 shrink-0"
              onSubmit={(e) => { e.preventDefault(); send(); }}
            >
              <span className="font-mono text-[14px] leading-none text-[var(--color-acc-red)]">›</span>
              <input
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }}
                placeholder="Demande qqch ou donne un ordre  ·  ⌥K pour toggle  ·  Esc ferme"
                className="flex-1 bg-transparent outline-none font-sans text-[14px] placeholder:font-mono placeholder:text-[10px] placeholder:uppercase placeholder:tracking-wider placeholder:text-[var(--color-fg-faint)] disabled:opacity-50"
                disabled={thinking}
              />
              <button type="submit" disabled={thinking || !prompt.trim()} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider bg-[var(--color-fg)] text-[var(--color-bg)] disabled:opacity-50">
                {thinking ? '…' : 'SEND ↵'}
              </button>
            </form>
          </aside>
        </>
      )}
    </>
  );
}
