import { useEffect, useState } from 'react';

interface Block { section: string; body: string; }

export default function MorningBriefLive() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  async function refresh() {
    try {
      const r = await fetch('/api/brief').then(r => r.json());
      setBlocks(r.blocks || []);
      setDate(r.date);
    } finally { setLoading(false); }
  }
  async function regenerate() {
    setRegenerating(true);
    await fetch('/api/brief/generate', { method: 'POST' });
    await refresh();
    setRegenerating(false);
  }
  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  // date calculée dans le navigateur (le site est construit à l'avance : sinon date du build + erreur d'hydratation)
  const [today, setToday] = useState('');
  useEffect(() => { setToday(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })); }, []);

  return (
    <aside className="border-t-[1.5px] md:border-t-0 md:border-r-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-paper)] flex flex-col min-h-0 md:h-full overflow-hidden">
      <header className="px-3 py-2 brutal-border-bottom bg-[var(--color-fg)] text-[var(--color-bg)] shrink-0">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em]">→ MORNING BRIEF</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.05em] mt-[1px]">READ THIS FIRST</div>
      </header>
      <div className="px-3 py-[6px] border-b border-[var(--color-border-soft)] shrink-0 flex items-center justify-between">
        <p className="font-mono text-[10px] text-[var(--color-fg-muted)] uppercase tracking-wider">{today}</p>
        <button onClick={regenerate} disabled={regenerating} className="font-mono text-[9px] uppercase tracking-wider hover:text-[var(--color-acc-red)] disabled:opacity-50">{regenerating ? '…' : '↻'}</button>
      </div>
      <div className="overflow-y-auto flex-1 px-3 py-2 space-y-3 min-h-0">
        {loading ? (
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">LOADING…</div>
        ) : blocks.length === 0 ? (
          <div>
            <p className="font-mono text-[10.5px] leading-[1.55] text-[var(--color-fg-muted)]">Pas encore de brief.</p>
            <button onClick={regenerate} disabled={regenerating} className="mt-3 font-mono text-[10px] uppercase tracking-wider bg-[var(--color-fg)] text-[var(--color-bg)] px-2 py-1 disabled:opacity-50">{regenerating ? 'GÉNÈRE…' : 'GÉNÉRER MAINTENANT'}</button>
          </div>
        ) : blocks.map(b => (
          <details key={b.section} open className="group">
            <summary className="cursor-pointer list-none flex items-center gap-1 select-none">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-acc-red)] group-open:text-[var(--color-fg)]">⌘ {b.section}</span>
              <span className="ml-auto font-mono text-[9px] text-[var(--color-fg-faint)] group-open:rotate-90 transition-transform inline-block">›</span>
            </summary>
            <pre className="mt-1 font-mono text-[10.5px] leading-[1.55] whitespace-pre-wrap break-words text-[var(--color-fg)]">{b.body}</pre>
          </details>
        ))}
      </div>
      <footer className="px-3 py-[6px] border-t-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-soft)] shrink-0">
        <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          Généré par Gemini · cron 23h{date ? ` · ${date}` : ''}
        </p>
      </footer>
    </aside>
  );
}
