import { useEffect, useState } from 'react';

interface ContainerInfo { id: string; name: string; image: string; status: string; state: string; up: boolean; ports: string[]; portainerUrl: string; }
interface SysInfo {
  cpu: { load: number; cores: number };
  mem: { humanUsed: string; humanTotal: string; humanFree?: string; pct: number };
  disk: { humanUsed: string; humanSize: string; pct: number } | null;
  load: { avg1: number; avg5: number };
  uptimeDays: number;
  temp: number;
  net: { iface: string; rx: number; tx: number; rxTotal: number; txTotal: number } | null;
  containers: { up: number; total: number; list: ContainerInfo[] };
  history: { cpu: number[]; mem: number[]; netIn: number[]; netOut: number[] };
}
interface HCheck { name: string; url: string; status: number; ok: boolean; ms: number; error?: string; }

function asciiSpark(values: number[], max?: number, chars = '▁▂▃▄▅▆▇█') {
  if (values.length === 0) return '';
  const m = max ?? Math.max(...values, 1);
  return values.map(v => chars[Math.min(chars.length - 1, Math.max(0, Math.floor((v / m) * (chars.length - 1))))]).join('');
}
function humanRate(bps: number) {
  if (bps > 1e6) return `${(bps/1e6).toFixed(1)}M/s`;
  if (bps > 1e3) return `${(bps/1e3).toFixed(0)}K/s`;
  return `${bps.toFixed(0)}B/s`;
}
function humanBytes(b: number) {
  if (b >= 1e12) return `${(b/1e12).toFixed(2)}T`;
  if (b >= 1e9) return `${(b/1e9).toFixed(1)}G`;
  if (b >= 1e6) return `${(b/1e6).toFixed(0)}M`;
  if (b >= 1e3) return `${(b/1e3).toFixed(0)}K`;
  return `${b}B`;
}

export default function SystemBoard() {
  const [sys, setSys] = useState<SysInfo | null>(null);
  const [checks, setChecks] = useState<HCheck[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch('/api/system').then(r => r.json());
        if (!cancelled) { setSys(r); setErr(null); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    }
    tick();
    const i = setInterval(tick, 1500);
    // healthchecks moins fréquent (60s)
    fetch('/api/healthchecks').then(r => r.json()).then(d => !cancelled && setChecks(d.checks || []));
    const i2 = setInterval(() => fetch('/api/healthchecks').then(r => r.json()).then(d => !cancelled && setChecks(d.checks || [])).catch(() => {}), 60_000);
    return () => { cancelled = true; clearInterval(i); clearInterval(i2); };
  }, []);

  if (!sys) return <div className="px-6 py-6 font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)]">{err ? `ERROR · ${err}` : 'LOADING…'}</div>;

  const today = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex flex-col h-full overflow-y-auto min-h-0 anim-fade-in">
      <header className="px-4 md:px-6 pt-3 pb-2 brutal-border-bottom flex flex-wrap items-end justify-between gap-x-4 shrink-0">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">serveur · systeminformation + docker socket</p>
          <h1 className="font-display text-[clamp(48px,6.5vw,88px)] mt-1">STACK.</h1>
        </div>
        <div className="text-right font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)] pb-2">
          <div>{today}</div>
          <div>POLL 1.5s · {sys.containers.up}/{sys.containers.total} UP</div>
        </div>
      </header>

      {/* Top metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 md:px-6 pt-4">
        <section className="brutal-border bg-[var(--color-bg-paper)] p-3 anim-slide-up">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-section">⌘ CPU</h3>
            <span className="font-mono text-[11px] tabular-nums">{sys.cpu.load.toFixed(1)}%</span>
          </div>
          <pre className="ascii-bar text-[var(--color-acc-green)] leading-none overflow-hidden whitespace-nowrap">{asciiSpark(sys.history.cpu.slice(-32), 100)}</pre>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] flex justify-between">
            <span>{sys.cpu.cores} CORES</span>
            <span>{sys.temp ? `${sys.temp.toFixed(0)}°C` : '—'}</span>
          </div>
        </section>

        <section className="brutal-border bg-[var(--color-bg-paper)] p-3 anim-slide-up" style={{ animationDelay: '60ms' }}>
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-section">⌘ MEM</h3>
            <span className="font-mono text-[11px] tabular-nums">{sys.mem.pct}%</span>
          </div>
          <pre className="ascii-bar text-[var(--color-acc-orange)] leading-none overflow-hidden whitespace-nowrap">{asciiSpark(sys.history.mem.slice(-32), 100)}</pre>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] flex justify-between">
            <span>USED {sys.mem.humanUsed}</span>
            <span>TOTAL {sys.mem.humanTotal}</span>
          </div>
        </section>

        {sys.disk && (
          <section className="brutal-border bg-[var(--color-bg-paper)] p-3 anim-slide-up" style={{ animationDelay: '120ms' }}>
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="font-section">⌘ DISK /</h3>
              <span className="font-mono text-[11px] tabular-nums">{sys.disk.pct}%</span>
            </div>
            <div className="progress-stepped mt-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} data-on={i < Math.round((sys.disk!.pct / 100) * 12) ? 'true' : 'false'}></div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] flex justify-between">
              <span>USED {sys.disk.humanUsed}</span>
              <span>TOTAL {sys.disk.humanSize}</span>
            </div>
          </section>
        )}

        <section className="brutal-border bg-[var(--color-bg-paper)] p-3 anim-slide-up" style={{ animationDelay: '180ms' }}>
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-section">⌘ NET · {sys.net?.iface || '?'}</h3>
            <span className="font-mono text-[10px] tabular-nums">↓ {humanRate(sys.net?.rx || 0)}</span>
          </div>
          <pre className="ascii-bar text-[var(--color-acc-blue)] leading-none overflow-hidden whitespace-nowrap">{asciiSpark(sys.history.netIn.slice(-32))}</pre>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] flex justify-between">
            <span>↑ {humanRate(sys.net?.tx || 0)}</span>
            <span>TOTAL ↓{humanBytes(sys.net?.rxTotal || 0)}</span>
          </div>
        </section>
      </div>

      {/* Two-column section : containers + healthchecks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 px-4 md:px-6 pt-4 pb-24 md:pb-6">
        {/* Containers */}
        <section className="lg:col-span-2 min-w-0 brutal-border bg-[var(--color-bg-paper)] anim-slide-up" style={{ animationDelay: '240ms' }}>
          <header className="px-3 py-2 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between">
            <h3 className="font-section">⌘ DOCKER CONTAINERS · {sys.containers.up}/{sys.containers.total}</h3>
          </header>
          <div>
            {sys.containers.list.length === 0 ? (
              <div className="px-3 py-4 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— NO DATA —</div>
            ) : sys.containers.list.map((c, i) => (
              <a key={c.id || c.name} href={c.portainerUrl || undefined} target="_blank" rel="noopener"
                className="grid grid-cols-[16px_1fr_auto] md:grid-cols-[16px_180px_1fr_auto_60px] gap-3 px-3 py-[5px] border-b border-[var(--color-border-soft)] last:border-b-0 hover-paper items-center anim-fade-in"
                style={{ animationDelay: `${Math.min(i * 12, 400)}ms` }}>
                <span className={`inline-block w-2 h-2 ${c.up ? 'bg-[var(--color-acc-green)]' : 'bg-[var(--color-acc-red)]'}`}></span>
                <span className="font-mono text-[11px] uppercase tracking-wider truncate">{c.name}</span>
                <span className="hidden md:block font-mono text-[10px] text-[var(--color-fg-muted)] truncate">{c.image}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] truncate">{c.status}</span>
                <span className="hidden md:block font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-faint)] truncate text-right">→</span>
              </a>
            ))}
          </div>
        </section>

        {/* Healthchecks */}
        <section className="brutal-border bg-[var(--color-bg-paper)] anim-slide-up" style={{ animationDelay: '300ms' }}>
          <header className="px-3 py-2 brutal-border-bottom bg-[var(--color-bg-soft)]">
            <h3 className="font-section">⌘ HEALTHCHECKS · {checks.filter(c=>c.ok).length}/{checks.length}</h3>
          </header>
          <div>
            {checks.length === 0 ? (
              <div className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">AUCUN SERVICE (HEALTHCHECK_SERVICES)</div>
            ) : checks.map((c, i) => (
              <a key={c.name} href={c.url} target="_blank" rel="noopener" className="grid grid-cols-[16px_1fr_auto] gap-2 px-3 py-[5px] border-b border-[var(--color-border-soft)] last:border-b-0 hover-paper items-center anim-fade-in" style={{ animationDelay: `${Math.min(i * 25 + 300, 600)}ms` }}>
                <span className={`inline-block w-2 h-2 ${c.ok ? 'bg-[var(--color-acc-green)]' : 'bg-[var(--color-acc-red)]'}`}></span>
                <span className="font-mono text-[11px] uppercase tracking-wider truncate">{c.name}</span>
                <span className="font-mono text-[9px] tabular-nums text-[var(--color-fg-muted)] whitespace-nowrap">{c.status || 'ERR'} · {c.ms}ms</span>
              </a>
            ))}
          </div>
        </section>
      </div>

      <footer className="shrink-0 px-6 py-2 border-t-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-soft)] flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
        <span>UPTIME {sys.uptimeDays}D · LOAD {sys.load.avg1.toFixed(2)} {sys.load.avg5.toFixed(2)}</span>
        <span>CLICK SERVICE → OPEN</span>
      </footer>
    </div>
  );
}
