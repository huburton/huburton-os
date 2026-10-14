import { useEffect, useState, useRef } from 'react';

interface Event { id: string; ts: number; source: string; kind: string; title: string; detail?: string; level: 'info' | 'ok' | 'warn' | 'err'; }
interface Task { id: string; title: string; size: string; done: boolean; doneAt?: string; project?: string; tags: string[]; createdAt?: string; }
interface Project { name: string; total: number; done: number; }

const LEVEL_COLOR: Record<string, string> = {
  ok: 'border-l-[var(--color-acc-green)]', info: 'border-l-[var(--color-acc-blue)]',
  warn: 'border-l-[var(--color-acc-orange)]', err: 'border-l-[var(--color-acc-red)]',
};
const SOURCE_BADGE: Record<string, string> = {
  'claude-code': 'bg-[var(--color-acc-blue)] text-[var(--color-bg)]',
  'plateforme': 'bg-[var(--color-fg)] text-[var(--color-bg)]',
  'system': 'bg-[var(--color-acc-violet)] text-[var(--color-bg)]',
  'gemini': 'bg-[var(--color-acc-orange)] text-[var(--color-bg)]',
};

function fmtTime(ts: number) { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(ts: number) { return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }

export default function BriefBoard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/events?limit=200').then(r => r.json()).then(d => setEvents(d.events || [])),
      fetch('/api/tasks').then(r => r.json()).then(d => setTasks(d.tasks || [])),
      fetch('/api/projects').then(r => r.json()).then(d => setProjects(d.projects || [])),
    ]);
    const es = new EventSource('/api/events/stream');
    es.addEventListener('event', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as Event;
        setEvents(prev => {
          if (prev.find(e => e.id === data.id)) return prev;
          return [data, ...prev].slice(0, 300);
        });
      } catch {}
    });
    es.addEventListener('open', () => setConnected(true));
    es.addEventListener('error', () => setConnected(false));
    return () => es.close();
  }, []);

  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart); weekStart.setDate(todayStart.getDate() - 6);

  const todayDone = tasks.filter(t => t.done && t.doneAt && Date.parse(t.doneAt) >= todayStart.getTime()).length;
  const weekDone = tasks.filter(t => t.done && t.doneAt && Date.parse(t.doneAt) >= weekStart.getTime()).length;
  const totalOpen = tasks.filter(t => !t.done).length;
  const overdueProjects = projects.filter(p => p.total > p.done && (p.done / p.total) < 0.5);
  const closeToDoneProjects = projects.filter(p => p.total > 0 && (p.done / p.total) >= 0.8 && p.done < p.total);

  // Events activity per hour last 24h
  const hourBuckets = Array(24).fill(0);
  for (const e of events) {
    const age = now - e.ts;
    if (age < 24 * 3600 * 1000) {
      const h = Math.floor(age / (3600 * 1000));
      hourBuckets[23 - h]++;
    }
  }
  const maxBucket = Math.max(...hourBuckets, 1);
  const spark = hourBuckets.map(v => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((v / maxBucket) * 7))]).join('');

  // Group events by date
  const groups = new Map<string, Event[]>();
  for (const e of events) {
    const k = fmtDate(e.ts);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-[1500px] mx-auto px-4 md:px-8 pt-5 md:pt-6 pb-24">
        <header className="brutal-border-bottom pb-4 mb-6 flex flex-wrap items-end justify-between gap-x-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">DAILY BRIEF · STATS · STREAM · CLAUDE CODE</p>
            <h1 className="font-display text-[clamp(48px,11.5vw,128px)] mt-1">BRIEF.</h1>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider pb-2">
            <span className={`inline-block w-2 h-2 mr-1 ${connected ? 'bg-[var(--color-acc-green)]' : 'bg-[var(--color-acc-red)]'}`}></span>
            SSE · {events.length} EVENTS
          </div>
        </header>

        {/* STATS GRID */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="brutal-border bg-[var(--color-bg-paper)] p-3 min-w-0 overflow-hidden">
            <p className="font-section text-[var(--color-fg-muted)]">DONE TODAY</p>
            <p className="font-display text-[44px] mt-1 tabular-nums">{String(todayDone).padStart(2,'0')}</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] mt-1">tasks completées</p>
          </div>
          <div className="brutal-border bg-[var(--color-bg-paper)] p-3 min-w-0 overflow-hidden">
            <p className="font-section text-[var(--color-fg-muted)]">DONE WEEK</p>
            <p className="font-display text-[44px] mt-1 tabular-nums">{String(weekDone).padStart(2,'0')}</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] mt-1">last 7 days</p>
          </div>
          <div className="brutal-border bg-[var(--color-bg-paper)] p-3 min-w-0 overflow-hidden">
            <p className="font-section text-[var(--color-fg-muted)]">OPEN TOTAL</p>
            <p className="font-display text-[44px] mt-1 tabular-nums">{String(totalOpen).padStart(2,'0')}</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] mt-1">in pipeline</p>
          </div>
          <div className="brutal-border bg-[var(--color-bg-paper)] p-3 min-w-0 overflow-hidden">
            <p className="font-section text-[var(--color-fg-muted)]">EVENTS 24h</p>
            <p className="font-display text-[44px] mt-1 tabular-nums">{events.filter(e => now - e.ts < 86400000).length}</p>
            <pre className="ascii-bar text-[var(--color-acc-blue)] mt-1 leading-none">{spark}</pre>
          </div>
        </section>

        {/* PROJECTS WATCH */}
        {(closeToDoneProjects.length > 0 || overdueProjects.length > 0) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="brutal-border bg-[var(--color-bg-paper)]">
              <header className="px-3 py-2 brutal-border-bottom bg-[var(--color-bg-soft)]">
                <h3 className="font-section text-[var(--color-acc-green)]">⌘ ALMOST DONE · {closeToDoneProjects.length}</h3>
              </header>
              {closeToDoneProjects.length === 0 ? (
                <div className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— RIEN À PRESQUE FINI —</div>
              ) : closeToDoneProjects.map(p => {
                const pct = Math.round((p.done / p.total) * 100);
                return (
                  <a href="/projects" key={p.name} className="block px-3 py-2 border-b border-[var(--color-border-soft)] last:border-b-0 hover-paper">
                    <div className="flex items-baseline justify-between">
                      <span className="font-display text-[18px]">{p.name}.</span>
                      <span className="font-mono text-[11px] tabular-nums">{p.done}/{p.total} · {pct}%</span>
                    </div>
                  </a>
                );
              })}
            </div>
            <div className="brutal-border bg-[var(--color-bg-paper)]">
              <header className="px-3 py-2 brutal-border-bottom bg-[var(--color-bg-soft)]">
                <h3 className="font-section text-[var(--color-acc-orange)]">⌘ STAGNATION · {overdueProjects.length}</h3>
              </header>
              {overdueProjects.length === 0 ? (
                <div className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— TOUS LES PROJETS AVANCENT BIEN —</div>
              ) : overdueProjects.map(p => {
                const pct = Math.round((p.done / p.total) * 100);
                return (
                  <a href="/projects" key={p.name} className="block px-3 py-2 border-b border-[var(--color-border-soft)] last:border-b-0 hover-paper">
                    <div className="flex items-baseline justify-between">
                      <span className="font-display text-[18px]">{p.name}.</span>
                      <span className="font-mono text-[11px] tabular-nums">{p.done}/{p.total} · {pct}%</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* STREAM */}
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-section">→ ACTIVITY STREAM</h2>
            <span className="h-px bg-[var(--color-border-soft)] flex-1"></span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">{events.length} EVENTS · SSE LIVE</span>
          </div>
          {events.length === 0 ? (
            <div className="brutal-border bg-[var(--color-bg-paper)] p-6 font-mono text-[12px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— PAS ENCORE D'ÉVÉNEMENTS —</div>
          ) : (
            <div className="space-y-5">
              {[...groups.entries()].map(([date, items]) => (
                <section key={date}>
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)] mb-2">→ {date} · {items.length}</h3>
                  <div className="brutal-border bg-[var(--color-bg-paper)]">
                    {items.map(e => (
                      <div key={e.id} className={`grid grid-cols-[44px_1fr] md:grid-cols-[60px_92px_1fr_auto] gap-x-3 gap-y-1 px-3 py-[5px] border-b border-[var(--color-border-soft)] last:border-b-0 border-l-[3px] ${LEVEL_COLOR[e.level] || 'border-l-transparent'} items-start`}>
                        <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)] pt-[2px]">{fmtTime(e.ts)}</span>
                        <span className={`justify-self-start font-mono text-[9px] uppercase tracking-wider px-[5px] py-[1px] mt-[1px] ${SOURCE_BADGE[e.source] || 'bg-[var(--color-fg-muted)] text-[var(--color-bg)]'}`}>{e.source}</span>
                        <div className="min-w-0 col-start-2 md:col-start-auto">
                          <p className="font-sans text-[12px] leading-[1.35]">{e.title}</p>
                          {e.detail && <p className="font-mono text-[10px] text-[var(--color-fg-muted)] mt-[1px] break-words">{e.detail}</p>}
                        </div>
                        <span className="hidden md:inline font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-faint)] mt-[2px]">{e.kind}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
