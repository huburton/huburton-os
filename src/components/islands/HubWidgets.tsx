import { useEffect, useState } from 'react';
import CalendarToday from './CalendarToday';

interface Task { id: string; title: string; size: string; project?: string; done: boolean; tags: string[]; }
interface SysInfo {
  cpu: { load: number; cores: number };
  mem: { humanUsed: string; humanTotal: string; pct: number };
  disk: { humanUsed: string; humanSize: string; pct: number } | null;
  load: { avg1: number };
  uptimeDays: number;
  net: { iface: string; rx: number; tx: number } | null;
  containers: { up: number; total: number };
  history: { cpu: number[]; mem: number[]; netIn: number[]; netOut: number[] };
}

function asciiSpark(values: number[], max?: number, chars = '▁▂▃▄▅▆▇█') {
  if (values.length === 0) return '';
  const m = max ?? Math.max(...values, 1);
  return values.map(v => chars[Math.min(chars.length - 1, Math.max(0, Math.floor((v / m) * (chars.length - 1))))]).join('');
}
function asciiBar(pct: number, segments = 18) {
  const filled = Math.round((pct / 100) * segments);
  return '█'.repeat(filled) + '▒'.repeat(segments - filled);
}
function humanRate(bps: number) {
  if (bps > 1e6) return `${(bps/1e6).toFixed(1)}M`;
  if (bps > 1e3) return `${(bps/1e3).toFixed(0)}K`;
  return `${bps.toFixed(0)}B`;
}

export default function HubWidgets() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sys, setSys] = useState<SysInfo | null>(null);

  async function refresh() {
    try {
      const [t, s] = await Promise.all([
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/system').then(r => r.json()),
      ]);
      setTasks(t.tasks || []);
      setSys(s);
    } catch { /* ignore */ }
  }
  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 2000);
    return () => clearInterval(i);
  }, []);

  const focusTasks = tasks.filter(t => !t.done && (t.size === 'medium' || t.size === 'big')).slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 lg:h-full min-h-0">
      {/* Row 1 : Focus + Stack */}
      <section className="md:col-span-2 min-h-[160px] md:min-h-0 brutal-border bg-[var(--color-bg-paper)] flex flex-col min-h-0 anim-slide-up" style={{ animationDelay: '160ms' }}>
        <header className="px-3 py-1 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between shrink-0">
          <h3 className="font-section">⌘ FOCUS NOW · {focusTasks.length}</h3>
          <a href="/today" className="font-mono text-[9px] uppercase tracking-wider underline">TODAY →</a>
        </header>
        <div className="overflow-y-auto flex-1 min-h-0">
          {focusTasks.length === 0 ? (
            <div className="px-3 py-4 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— RIEN À FOCUS —</div>
          ) : focusTasks.map((t, i) => (
            <div key={t.id} className="px-3 py-[5px] border-b border-[var(--color-border-soft)] last:border-b-0 flex items-center gap-2 anim-fade-in" style={{ animationDelay: `${i * 40 + 200}ms` }}>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] w-10 shrink-0">{t.size}</span>
              <p className="font-sans text-[12px] flex-1 truncate">{t.title}</p>
              {t.project && <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] shrink-0">› {t.project}</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="brutal-border bg-[var(--color-bg-paper)] flex flex-col min-h-0 anim-slide-up" style={{ animationDelay: '200ms' }}>
        <header className="px-3 py-1 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between shrink-0">
          <h3 className="font-section">⌘ STACK</h3>
          <a href="/system" className="font-mono text-[9px] uppercase tracking-wider underline">DETAILS →</a>
        </header>
        {!sys ? (
          <div className="p-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">LOADING…</div>
        ) : (
          <div className="p-3 space-y-2 overflow-y-auto flex-1 min-h-0">
            <div>
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider mb-[2px]"><span>CPU</span><span className="tabular-nums">{sys.cpu.load.toFixed(1)}%</span></div>
              <pre className="ascii-bar text-[var(--color-acc-green)] leading-none overflow-hidden whitespace-nowrap">{asciiSpark(sys.history.cpu.slice(-22), 100)}</pre>
            </div>
            <div>
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider mb-[2px]"><span>MEM</span><span className="tabular-nums">{sys.mem.humanUsed}/{sys.mem.humanTotal}</span></div>
              <pre className="ascii-bar text-[var(--color-acc-orange)] leading-none overflow-hidden whitespace-nowrap">{asciiBar(sys.mem.pct)}</pre>
            </div>
            {sys.disk && (
              <div>
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider mb-[2px]"><span>DISK</span><span className="tabular-nums">{sys.disk.humanUsed}/{sys.disk.humanSize}</span></div>
                <pre className="ascii-bar text-[var(--color-acc-blue)] leading-none overflow-hidden whitespace-nowrap">{asciiBar(sys.disk.pct)}</pre>
              </div>
            )}
            <div>
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider mb-[2px]"><span>NET ↓↑</span><span className="tabular-nums">{humanRate(sys.net?.rx || 0)}/s · {humanRate(sys.net?.tx || 0)}/s</span></div>
              <pre className="ascii-bar leading-none overflow-hidden whitespace-nowrap">{asciiSpark(sys.history.netIn.slice(-22))}</pre>
            </div>
            <div className="pt-1 border-t border-[var(--color-border-soft)] font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] flex justify-between">
              <span>UP {sys.uptimeDays}D</span><span>{sys.containers.up}/{sys.containers.total} CT</span><span>LOAD {sys.load.avg1.toFixed(2)}</span>
            </div>
          </div>
        )}
      </section>

      {/* Row 2 : Calendar today + tomorrow preview (pleine largeur) */}
      <div className="md:col-span-3 min-h-0 lg:overflow-hidden">
        <CalendarToday />
      </div>
    </div>
  );
}
