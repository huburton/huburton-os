import { useEffect, useState } from 'react';

interface Machine {
  ai_mode: boolean | null; gpu: { vram_used_mib: number; vram_total_mib: number } | null;
  models: { id: string; status: string }[] | null; services: Record<string, string>;
}
interface State { pc: Machine | null; server: Machine | null }

const gib = (mib: number) => (mib / 1024).toFixed(1).replace('.', ',');
const dot = (on: boolean) => <span className="inline-block w-2 h-2 shrink-0" style={{ background: on ? 'var(--color-acc-green)' : 'var(--color-acc-red)' }} />;
const loaded = (m: Machine | null) => (m?.models || []).filter(x => x.status === 'loaded').map(x => x.id.toUpperCase());

/** HUB : état de l'IA locale (page IA.), en bref */
export default function HubAgents() {
  const [st, setSt] = useState<State | null>(null);

  useEffect(() => {
    const load = () => {
      fetch('/api/ai').then(r => r.json()).then(setSt).catch(() => {});
    };
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, []);

  const row = 'grid grid-cols-[auto_1fr_auto] gap-2 items-center px-3 py-2 brutal-border-bottom hover-paper';
  const meta = 'font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] truncate';
  const machine = (label: string, m: Machine | null | undefined, extra: string) => (
    <a href="/ia" className={row}>
      {dot(!!m)}
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-wider">{label}</p>
        <p className={meta}>{m ? `${loaded(m).join(' + ') || 'aucun modèle chargé'}${extra}` : 'éteint / injoignable'}</p>
      </div>
      <span className="font-mono text-[10px] tabular-nums">{m?.gpu ? `${gib(m.gpu.vram_used_mib)}/${gib(m.gpu.vram_total_mib)} GO` : '—'}</span>
    </a>
  );

  return (
    <section className="brutal-border bg-[var(--color-bg-paper)] h-full flex flex-col min-h-0 anim-slide-up" style={{ animationDelay: '300ms' }}>
      <header className="px-3 py-1 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between shrink-0">
        <h3 className="font-section">⌘ IA LOCALE</h3>
        <a href="/ia" className="font-mono text-[9px] uppercase tracking-wider underline">IA →</a>
      </header>
      {machine('DESKTOP · PC', st?.pc, st?.pc?.ai_mode ? ' · mode IA' : '')}
      {machine('SERVER · HOMELAB', st?.server, '')}
      <p className="px-3 py-2 font-sans text-[12px] text-[var(--color-fg-muted)]">
        Modèles llama.cpp sur les deux machines. Sans service d'état configuré (AI_*_STATUS_URL), elles apparaissent éteintes.
      </p>
    </section>
  );
}
