import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors,
  closestCorners, type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskDetailModal from './TaskDetailModal';

type Size = 'small' | 'medium' | 'big';
const SIZES: Size[] = ['small', 'medium', 'big'];
interface Task {
  id: string; title: string; size: Size; tags: string[];
  done: boolean; overdue?: boolean; project?: string; createdAt?: string; order?: number;
}
type Columns = { small: Task[]; medium: Task[]; big: Task[] };

const tagColor: Record<string, string> = {
  MONEY: 'bg-[var(--color-acc-green)] text-[var(--color-bg)]',
  MOVE: 'bg-[var(--color-acc-red)] text-[var(--color-bg)]',
  SUMMARY: 'bg-[var(--color-acc-orange)] text-[var(--color-bg)]',
  CODE: 'bg-[var(--color-acc-blue)] text-[var(--color-bg)]',
  CALL: 'bg-[var(--color-acc-violet)] text-[var(--color-bg)]',
  BUY: 'bg-[var(--color-acc-yellow)] text-[var(--color-fg)]',
  RECURRING: 'bg-[var(--color-acc-violet)] text-[var(--color-bg)]',
  IDEA: 'bg-[var(--color-acc-yellow)] text-[var(--color-fg)]',
};
function Tag({ label }: { label: string }) {
  const cls = tagColor[label] || 'bg-[var(--color-fg)] text-[var(--color-bg)]';
  return <span className={`inline-flex items-center px-[5px] py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.08em] ${cls}`}>{label}</span>;
}

function findColumn(cols: Columns, taskId: string): Size | null {
  for (const k of SIZES) if (cols[k].some(t => t.id === taskId)) return k;
  return null;
}

function SortableTaskRow({ task, index, justDone, isNext, onToggle, onDelete, onOpen }: {
  task: Task; index: number; justDone: boolean; isNext: boolean;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const rowRef = useRef<HTMLDivElement | null>(null);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    animationDelay: `${Math.min(index * 25, 600)}ms`,
  };
  function setRef(el: HTMLDivElement | null) {
    rowRef.current = el;
    setNodeRef(el);
  }
  function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    if (checked && rowRef.current) {
      // micro-celebration : 5 sparks
      const rect = rowRef.current.getBoundingClientRect();
      const centerX = rect.left + 28;
      const centerY = rect.top + rect.height / 2;
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('div');
        s.className = 'task-spark';
        s.style.position = 'fixed';
        s.style.left = `${centerX}px`;
        s.style.top = `${centerY}px`;
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const dist = 22 + Math.random() * 12;
        s.style.setProperty('--spark-x', `${Math.cos(angle) * dist}px`);
        s.style.setProperty('--spark-y', `${Math.sin(angle) * dist}px`);
        s.style.zIndex = '999';
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 600);
      }
    }
    onToggle(task.id, checked);
  }
  return (
    <div ref={setRef} style={style} data-task-row className={`group flex items-start gap-2 px-2 py-[6px] border-b border-[var(--color-border-soft)] last:border-b-0 hover-paper relative anim-slide-up ${task.overdue ? 'border-l-[3px] border-l-[var(--color-acc-red)]' : ''} ${justDone ? 'task-just-done' : ''} ${isNext && !task.done ? 'task-next' : ''}`}>
      <button {...attributes} {...listeners} data-drag-handle aria-label="drag" className="mt-[1px] text-[var(--color-fg-faint)] text-[12px] leading-none select-none cursor-grab active:cursor-grabbing">⋮⋮</button>
      <input type="checkbox" checked={task.done} onChange={handleToggle} onClick={(e) => e.stopPropagation()} className="mt-[3px] appearance-none w-[13px] h-[13px] border-[1.5px] border-[var(--color-fg)] bg-[var(--color-bg)] cursor-pointer relative checked:bg-[var(--color-acc-green)] checked:border-[var(--color-acc-green)] checked:after:content-['✓'] checked:after:absolute checked:after:inset-0 checked:after:flex checked:after:items-center checked:after:justify-center checked:after:text-[11px] checked:after:leading-none checked:after:font-bold checked:after:text-[var(--color-bg)] shrink-0 transition-all duration-150" />
      <button onClick={() => onOpen(task.id)} className="flex-1 min-w-0 text-left cursor-pointer">
        <p className={`task-title font-sans text-[12px] leading-[1.35] ${task.done && !justDone ? 'line-through text-[var(--color-fg-faint)]' : ''}`}>{task.title}</p>
        {task.project && <p className="font-mono text-[9px] text-[var(--color-fg-faint)] mt-[1px] uppercase tracking-wider">› {task.project}</p>}
      </button>
      <div className="flex gap-[3px] shrink-0 mt-[2px]">
        {task.tags.slice(0, 3).map(t => <Tag key={t} label={t} />)}
      </div>
      <button data-task-action onClick={(e) => { e.stopPropagation(); if (confirm(`Supprimer "${task.title}" ?`)) onDelete(task.id); }} aria-label="delete" className="text-[var(--color-fg-faint)] hover:text-[var(--color-acc-red)] font-mono text-[12px] leading-none px-1">×</button>
    </div>
  );
}

function Column({ id, title, tasks, justDone, nextId, onToggle, onDelete, onOpen, isOver }: {
  id: Size; title: string; tasks: Task[];
  justDone: Set<string>; nextId: string | null;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  isOver?: boolean;
}) {
  const openCount = tasks.filter(t => !t.done).length;
  return (
    <div className={`border-b-[1.5px] md:border-b-0 md:border-r-[1.5px] border-[var(--color-border)] last:border-b-0 md:last:border-r-0 flex flex-col min-h-0 transition-colors duration-150 ${isOver ? 'bg-[var(--color-bg-paper)]' : ''}`}>
      <div className="flex items-center justify-between px-3 py-[6px] border-b-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-soft)] shrink-0">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]">
          {title} <span className="ml-1 bg-[var(--color-fg)] text-[var(--color-bg)] px-[5px] py-[1px] text-[9px] tabular-nums">{String(openCount).padStart(2, '0')}</span>
          {openCount !== tasks.length && <span className="ml-[3px] text-[9px] text-[var(--color-fg-faint)] font-mono">/ {String(tasks.length).padStart(2, '0')}</span>}
        </h3>
      </div>
      <SortableContext id={`col-${id}`} items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto min-h-0" data-col={id}>
          {tasks.length === 0 ? (
            <div className="px-3 py-4 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— EMPTY —</div>
          ) : tasks.map((t, idx) => (
            <SortableTaskRow
              key={t.id} task={t} index={idx}
              justDone={justDone.has(t.id)}
              isNext={nextId === t.id}
              onToggle={onToggle} onDelete={onDelete} onOpen={onOpen}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function DragPreview({ task }: { task: Task }) {
  return (
    <div className="brutal-border bg-[var(--color-bg-elev)] px-3 py-2 shadow-[4px_4px_0_0_var(--color-fg)] max-w-[420px]">
      <p className="font-sans text-[12px]">{task.title}</p>
      <div className="flex gap-[3px] mt-1">
        {task.tags.slice(0, 3).map(t => <Tag key={t} label={t} />)}
      </div>
    </div>
  );
}

export default function TodayBoard() {
  const [cols, setCols] = useState<Columns>({ small: [], medium: [], big: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Size | null>(null);
  const [modalId, setModalId] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [prevOpen, setPrevOpen] = useState<number | null>(null);
  const [flipKey, setFlipKey] = useState(0);

  // refs pour valeurs courantes (utilisé dans onDragEnd persist)
  const colsRef = useRef<Columns>(cols);
  colsRef.current = cols;

  // souris : glisser dès 5 px ; tactile : appui long (sinon le glisser vole le défilement de la page)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  );

  const groupTasks = (tasks: Task[]): Columns => {
    const sorted = [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return {
      small: sorted.filter(t => t.size === 'small'),
      medium: sorted.filter(t => t.size === 'medium'),
      big: sorted.filter(t => t.size === 'big'),
    };
  };

  const refresh = useCallback(async () => {
    try {
      const t = await fetch('/api/tasks').then(r => r.json());
      setCols(groupTasks(t.tasks || []));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('tasks:changed', onChange);
    const poll = setInterval(refresh, 30_000);
    return () => { window.removeEventListener('tasks:changed', onChange); clearInterval(poll); };
  }, [refresh]);

  async function toggleDone(id: string, done: boolean) {
    setCols(prev => {
      const next = { small: [...prev.small], medium: [...prev.medium], big: [...prev.big] };
      for (const k of SIZES) next[k] = next[k].map(t => t.id === id ? { ...t, done } : t);
      return next;
    });
    if (done) {
      setJustDone(prev => new Set(prev).add(id));
      setTimeout(() => setJustDone(prev => { const n = new Set(prev); n.delete(id); return n; }), 900);
    }
    await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) });
  }
  async function deleteTask(id: string) {
    setCols(prev => ({
      small: prev.small.filter(t => t.id !== id),
      medium: prev.medium.filter(t => t.id !== id),
      big: prev.big.filter(t => t.id !== id),
    }));
    await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeCol = findColumn(cols, String(active.id));
    if (!activeCol) return;

    const overId = String(over.id);
    let overC: Size | null = null;
    if (overId.startsWith('col-')) overC = overId.replace('col-', '') as Size;
    else overC = findColumn(cols, overId);
    if (!overC) return;
    setOverCol(overC);

    if (activeCol === overC) return; // same col handled in onDragEnd

    // Move active task to target column at proper insertion point
    setCols(prev => {
      const activeTask = prev[activeCol].find(t => t.id === active.id);
      if (!activeTask) return prev;
      const newActive = prev[activeCol].filter(t => t.id !== active.id);
      const target = [...prev[overC!]];
      const moved = { ...activeTask, size: overC! };
      const overIdx = overId.startsWith('col-') ? target.length : target.findIndex(t => t.id === overId);
      const insertAt = overIdx >= 0 ? overIdx : target.length;
      target.splice(insertAt, 0, moved);
      return { ...prev, [activeCol]: newActive, [overC!]: target };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setOverCol(null);
    if (!over) return;

    const activeCol = findColumn(cols, String(active.id));
    if (!activeCol) return;

    const overId = String(over.id);
    let finalCol: Size = activeCol;
    if (overId.startsWith('col-')) finalCol = overId.replace('col-', '') as Size;
    else {
      const c = findColumn(cols, overId);
      if (c) finalCol = c;
    }

    // Same-column reorder via arrayMove
    if (activeCol === finalCol && active.id !== over.id) {
      const colItems = cols[finalCol];
      const oldIdx = colItems.findIndex(t => t.id === active.id);
      const newIdx = colItems.findIndex(t => t.id === over.id);
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        setCols(prev => ({ ...prev, [finalCol]: arrayMove(prev[finalCol], oldIdx, newIdx) }));
      }
    }

    // Persist : take fresh state via ref + RAF
    requestAnimationFrame(async () => {
      const fresh = colsRef.current;
      const items = fresh[finalCol].map((t, i) => ({ id: t.id, order: (i + 1) * 1000, size: finalCol }));
      try {
        await fetch('/api/tasks/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      } catch {/* ignore */}
      // Si on a changé de colonne, persist aussi l'ordre de la colonne source (au cas où)
      if (activeCol !== finalCol) {
        const sourceItems = fresh[activeCol].map((t, i) => ({ id: t.id, order: (i + 1) * 1000, size: activeCol }));
        try { await fetch('/api/tasks/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: sourceItems }) }); } catch {}
      }
    });
  }

  const totalOpen = cols.small.filter(t => !t.done).length + cols.medium.filter(t => !t.done).length + cols.big.filter(t => !t.done).length;
  const total = cols.small.length + cols.medium.length + cols.big.length;
  const done = total - totalOpen;
  // date calculée dans le navigateur (le site est construit à l'avance : sinon date du build + erreur d'hydratation)
  const [today, setToday] = useState('');
  useEffect(() => { setToday(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()); }, []);
  const activeTask = activeId ? [...cols.small, ...cols.medium, ...cols.big].find(t => t.id === activeId) : null;

  // Compteur flip à chaque changement
  useEffect(() => {
    if (prevOpen !== null && prevOpen !== totalOpen) setFlipKey(k => k + 1);
    setPrevOpen(totalOpen);
  }, [totalOpen]);

  // Next action : première tâche non done de la colonne avec le plus de tâches
  const nextActionId = useMemo(() => {
    const cands: Task[] = [];
    if (cols.big.length) cands.push(...cols.big.filter(t => !t.done));
    if (cols.medium.length) cands.push(...cols.medium.filter(t => !t.done));
    if (cols.small.length) cands.push(...cols.small.filter(t => !t.done));
    return cands[0]?.id || null;
  }, [cols]);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="flex flex-col md:h-full min-h-0 anim-fade-in">
          <header className="px-4 md:px-6 pt-3 pb-2 brutal-border-bottom flex items-end justify-between gap-4 shrink-0">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">FOCUS TODAY · {today}</p>
              <h1 className="font-display text-[clamp(48px,6.5vw,88px)] mt-1">TODAY.</h1>
            </div>
            <div className="flex items-end gap-4 pb-2">
              <div className="flex flex-col items-end">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)]">OPEN</span>
                <span key={`open-${flipKey}`} className="font-display text-[36px] leading-none tabular-nums anim-count-flip">{String(totalOpen).padStart(2, '0')}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-acc-green)]">DONE</span>
                <span key={`done-${flipKey}`} className="font-display text-[36px] leading-none tabular-nums text-[var(--color-acc-green)] anim-count-flip">{String(done).padStart(2, '0')}</span>
              </div>
              {total > 0 && (
                <div className="flex flex-col items-end opacity-60">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)]">%</span>
                  <span key={`pct-${flipKey}`} className="font-display text-[24px] leading-none tabular-nums anim-count-flip">{Math.round((done / total) * 100)}</span>
                </div>
              )}
            </div>
          </header>

          {err && <div className="bg-[var(--color-acc-red)] text-[var(--color-bg)] px-3 py-1 font-mono text-[10px] uppercase tracking-wider shrink-0">API ERROR · {err}</div>}

          <section className="grid grid-cols-1 md:grid-cols-3 md:flex-1 min-h-0 brutal-border-bottom">
            <Column id="small"  title="SMALL"  tasks={cols.small}  justDone={justDone} nextId={nextActionId} onToggle={toggleDone} onDelete={deleteTask} onOpen={setModalId} isOver={overCol === 'small'} />
            <Column id="medium" title="MEDIUM" tasks={cols.medium} justDone={justDone} nextId={nextActionId} onToggle={toggleDone} onDelete={deleteTask} onOpen={setModalId} isOver={overCol === 'medium'} />
            <Column id="big"    title="BIG"    tasks={cols.big}    justDone={justDone} nextId={nextActionId} onToggle={toggleDone} onDelete={deleteTask} onOpen={setModalId} isOver={overCol === 'big'} />
          </section>

          <footer className="shrink-0 px-4 md:px-6 py-2 border-t-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-soft)] flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            <span>{loading ? 'LOADING…' : `${total} TASKS · ${done} DONE`}</span>
            <span className="hidden md:inline">↵ small · ⇧↵ med · ⌥↵ big · / focus · drag = move + reorder · × delete · click to open</span>
          </footer>
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeTask ? <DragPreview task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal taskId={modalId} onClose={() => setModalId(null)} onChanged={refresh} />
    </>
  );
}
