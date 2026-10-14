import { useEffect, useState } from 'react';
import TaskDetailModal from './TaskDetailModal';

type Size = 'small' | 'medium' | 'big';
interface Task { id: string; title: string; size: Size; tags: string[]; done: boolean; project?: string; }
interface ProjectCount { name: string; total: number; done: number; }
interface ProjectMeta { id: string; name: string; subtitle?: string; description?: string; deadline?: string; status?: string; priority?: number; color?: string; tag?: string; body?: string; }

const STATUS_COLOR: Record<string, string> = {
  'planning': 'bg-[var(--color-acc-yellow)] text-[var(--color-fg)]',
  'in-progress': 'bg-[var(--color-acc-orange)] text-[var(--color-bg)]',
  'almost-done': 'bg-[var(--color-acc-green)] text-[var(--color-bg)]',
  'done': 'bg-[var(--color-fg)] text-[var(--color-bg)]',
  'paused': 'bg-[var(--color-fg-muted)] text-[var(--color-bg)]',
  'abandoned': 'bg-[var(--color-acc-red)] text-[var(--color-bg)]',
};

const COLOR_BORDER: Record<string, string> = {
  red: 'border-l-[var(--color-acc-red)]',
  green: 'border-l-[var(--color-acc-green)]',
  orange: 'border-l-[var(--color-acc-orange)]',
  blue: 'border-l-[var(--color-acc-blue)]',
  violet: 'border-l-[var(--color-acc-violet)]',
  yellow: 'border-l-[var(--color-acc-yellow)]',
};

function deadlineInfo(deadline?: string) {
  if (!deadline) return null;
  const d = new Date(deadline);
  const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  return {
    date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
    days,
    level: days < 0 ? 'overdue' : days < 7 ? 'urgent' : days < 30 ? 'soon' : 'far',
  };
}

export default function ProjectsBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<ProjectCount[]>([]);
  const [metas, setMetas] = useState<ProjectMeta[]>([]);
  const [modalId, setModalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Projets repliés (préférence locale au navigateur)
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('projects.collapsed') || '[]'); } catch { return []; }
  });
  const toggle = (name: string) => setCollapsed(prev => {
    const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name];
    try { localStorage.setItem('projects.collapsed', JSON.stringify(next)); } catch { /* stockage indisponible */ }
    return next;
  });

  async function refresh() {
    try {
      const [t, p, m] = await Promise.all([
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/project-metas').then(r => r.json()),
      ]);
      setTasks(t.tasks || []); setCounts(p.projects || []); setMetas(m.metas || []);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    refresh();
    window.addEventListener('tasks:changed', refresh);
    return () => window.removeEventListener('tasks:changed', refresh);
  }, []);

  // Fusionner : tous les projects connus = noms uniques de counts + metas
  const allNames = Array.from(new Set([...counts.map(c => c.name), ...metas.map(m => m.name)]));
  const projects = allNames.map(name => {
    const count = counts.find(c => c.name === name);
    const meta = metas.find(m => m.name === name);
    return { name, ...(count || { total: 0, done: 0 }), meta };
  }).sort((a, b) => {
    const pa = a.meta?.priority ?? 99;
    const pb = b.meta?.priority ?? 99;
    if (pa !== pb) return pa - pb;
    return b.total - a.total;
  });

  return (
    <>
      <div className="overflow-y-auto h-full anim-fade-in">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 pt-5 md:pt-6 pb-24">
          <header className="brutal-border-bottom pb-4 mb-6 flex flex-wrap items-end justify-between gap-x-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">{projects.length} ACTIVE · {tasks.length} TASKS · {metas.length} METAS</p>
              <h1 className="font-display text-[clamp(48px,11.5vw,128px)] mt-1">PROJECTS.</h1>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] pb-2">
              METADATA → ~/vault/30-projects/
            </span>
          </header>

          {loading ? (
            <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)]">LOADING…</div>
          ) : projects.length === 0 ? (
            <div className="brutal-border bg-[var(--color-bg-paper)] p-6 text-center font-mono text-[12px] uppercase tracking-wider text-[var(--color-fg-faint)]">— AUCUN PROJET — CAPTURE UNE TÂCHE AVEC @projet POUR EN CRÉER UN —</div>
          ) : (
            <div className="space-y-6">
              {projects.map((p, idx) => {
                const pTasks = tasks.filter(t => t.project === p.name);
                const open = pTasks.filter(t => !t.done);
                const done = pTasks.filter(t => t.done);
                const useMilestones = p.meta?.milestones && p.meta.milestones.length > 0;
                const mDone = useMilestones ? p.meta!.milestones!.filter(m => m.done).length : 0;
                const mTotal = useMilestones ? p.meta!.milestones!.length : 0;
                const pct = useMilestones
                  ? (mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0)
                  : (p.total > 0 ? Math.round((p.done / p.total) * 100) : 0);
                const filled = useMilestones
                  ? (mTotal > 0 ? Math.round((mDone / mTotal) * 24) : 0)
                  : (p.total > 0 ? Math.round((p.done / p.total) * 24) : 0);
                const dl = ['done', 'abandoned'].includes(p.meta?.status || '') ? null : deadlineInfo(p.meta?.deadline); // projet clos : plus d'échéance en rouge
                const isCollapsed = collapsed.includes(p.name);
                const borderLeftClass = p.meta?.color ? `border-l-[6px] ${COLOR_BORDER[p.meta.color] || 'border-l-[var(--color-fg)]'}` : '';
                return (
                  <section key={p.name} className={`brutal-border bg-[var(--color-bg-paper)] anim-slide-up ${borderLeftClass}`} style={{ animationDelay: `${idx * 80}ms` }}>
                    <header className="px-4 py-3 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <h2 className="font-display text-[clamp(30px,8.5vw,48px)] leading-none break-words min-w-0">{p.name}.</h2>
                          {p.meta?.status && (
                            <span className={`font-mono text-[10px] uppercase tracking-wider px-[6px] py-[1px] ${STATUS_COLOR[p.meta.status] || 'bg-[var(--color-fg)] text-[var(--color-bg)]'}`}>{p.meta.status.replace('-', ' ')}</span>
                          )}
                          {p.meta?.priority && (
                            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">P{p.meta.priority}</span>
                          )}
                          <button onClick={() => toggle(p.name)} className="font-mono text-[10px] uppercase tracking-wider px-[6px] py-[1px] brutal-border-soft hover-paper">
                            {isCollapsed ? `DÉPLIER · ${open.length} OUVERTES` : 'REPLIER'}
                          </button>
                        </div>
                        {p.meta?.subtitle && <p className="font-sans text-[14px] text-[var(--color-fg-muted)] mt-1">{p.meta.subtitle}</p>}
                        {!isCollapsed && p.meta?.description && <p className="font-sans text-[12px] text-[var(--color-fg-muted)] mt-2 max-w-2xl leading-[1.55]">{p.meta.description}</p>}
                      </div>
                      <div className="w-full md:w-auto md:text-right md:shrink-0">
                        <div className="grid gap-[2px] w-full md:w-[280px]" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
                          {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className={`h-[10px] ${i < filled ? 'bg-[var(--color-fg)]' : 'bg-[var(--color-bg-soft)] border border-[var(--color-border)]'}`}></div>
                          ))}
                        </div>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] mt-1">
                          {useMilestones ? `${mDone}/${mTotal} milestones` : `${p.done}/${p.total} tasks`} · {pct}%
                        </p>
                        {dl && (
                          <p className={`font-mono text-[10px] uppercase tracking-wider mt-1 ${
                            dl.level === 'overdue' ? 'text-[var(--color-acc-red)]' :
                            dl.level === 'urgent' ? 'text-[var(--color-acc-orange)]' :
                            dl.level === 'soon' ? 'text-[var(--color-acc-yellow)]' :
                            'text-[var(--color-fg-muted)]'
                          }`}>
                            DEADLINE {dl.date} · {dl.days >= 0 ? `J-${dl.days}` : `J+${-dl.days}`}
                          </p>
                        )}
                      </div>
                    </header>

                    {!isCollapsed && <>
                    {p.meta?.milestones && p.meta.milestones.length > 0 && (
                      <div className="px-4 py-3 border-b border-[var(--color-border-soft)]">
                        <h4 className="font-section text-[var(--color-fg-muted)] mb-2">→ MILESTONES</h4>
                        <div className="space-y-1">
                          {p.meta.milestones.map((m, i) => (
                            <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
                              <span className={`w-3 h-3 brutal-border-soft inline-flex items-center justify-center text-[10px] ${m.done ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : ''}`}>{m.done ? '×' : ''}</span>
                              <span className={m.done ? 'line-through text-[var(--color-fg-faint)]' : ''}>{m.title}</span>
                              {m.date && <span className="text-[var(--color-fg-muted)] ml-auto">{m.date}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y-[1.5px] md:divide-y-0 md:divide-x-[1.5px] divide-[var(--color-border)]">
                      <div>
                        <h3 className="font-section px-3 py-2 border-b border-[var(--color-border-soft)] bg-[var(--color-bg)]">
                          → OPEN <span className="bg-[var(--color-fg)] text-[var(--color-bg)] px-[5px] ml-1">{open.length}</span>
                        </h3>
                        {open.length === 0 ? (
                          <div className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— ALL DONE —</div>
                        ) : open.map(t => (
                          <button key={t.id} onClick={() => setModalId(t.id)} className="w-full text-left px-3 py-[9px] md:py-[5px] hover-paper border-b border-[var(--color-border-soft)] last:border-b-0 flex items-start gap-2">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] w-12 mt-[2px]">{t.size}</span>
                            <span className="font-sans text-[12px] flex-1">{t.title}</span>
                          </button>
                        ))}
                      </div>
                      <div>
                        <h3 className="font-section px-3 py-2 border-b border-[var(--color-border-soft)] bg-[var(--color-bg)]">
                          ✓ DONE <span className="bg-[var(--color-acc-green)] text-[var(--color-bg)] px-[5px] ml-1">{done.length}</span>
                        </h3>
                        {done.length === 0 ? (
                          <div className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— NONE YET —</div>
                        ) : done.map(t => (
                          <button key={t.id} onClick={() => setModalId(t.id)} className="w-full text-left px-3 py-[9px] md:py-[5px] hover-paper border-b border-[var(--color-border-soft)] last:border-b-0 flex items-start gap-2">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] w-12 mt-[2px]">{t.size}</span>
                            <span className="font-sans text-[12px] flex-1 line-through text-[var(--color-fg-faint)]">{t.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    </>}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <TaskDetailModal taskId={modalId} onClose={() => setModalId(null)} onChanged={refresh} />
    </>
  );
}
