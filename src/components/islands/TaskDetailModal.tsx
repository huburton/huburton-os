import { useEffect, useRef, useState } from 'react';

type Size = 'small' | 'medium' | 'big';
interface TaskDetail {
  id: string;
  title: string;
  size: Size;
  tags: string[];
  done: boolean;
  project?: string;
  createdAt?: string;
  doneAt?: string;
  body: string;
  links: string[];
  images: string[];
}

const SIZES: Size[] = ['small', 'medium', 'big'];

interface Props { taskId: string | null; onClose: () => void; onChanged: () => void; }

export default function TaskDetailModal({ taskId, onClose, onChanged }: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftProject, setDraftProject] = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!taskId) { setTask(null); return; }
    fetch(`/api/tasks/${encodeURIComponent(taskId)}`)
      .then(r => r.json())
      .then(d => {
        setTask(d.task);
        setDraftTitle(d.task.title);
        setDraftBody(d.task.body || '');
        setDraftTags((d.task.tags || []).join(' '));
        setDraftProject(d.task.project || '');
      })
      .catch(() => setTask(null));
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (editing && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        save();
      }
      if (!editing && (e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setEditing(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [taskId, onClose, editing, draftTitle, draftBody, draftTags, draftProject]);

  useEffect(() => {
    if (editing && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [editing]);

  if (!taskId || !task) {
    return taskId ? (
      <>
        <div className="modal-overlay" onClick={onClose} />
        <div className="modal-panel p-6 font-mono text-[12px] uppercase tracking-wider">LOADING…</div>
      </>
    ) : null;
  }

  async function save() {
    if (!task) return;
    setSaving(true);
    try {
      const tags = draftTags.split(/\s+/).map(s => s.replace(/^#/, '').toUpperCase()).filter(Boolean);
      await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle.trim() || task.title,
          tags,
          project: draftProject.trim().toUpperCase() || '',
          body: draftBody,
        }),
      });
      setEditing(false);
      onChanged();
      // refresh task detail
      const fresh = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`).then(r => r.json());
      setTask(fresh.task);
    } finally { setSaving(false); }
  }

  async function changeSize(s: Size) {
    if (!task) return;
    await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: s }),
    });
    setTask({ ...task, size: s });
    onChanged();
  }

  async function toggleDone() {
    if (!task) return;
    const newDone = !task.done;
    await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: newDone }),
    });
    setTask({ ...task, done: newDone });
    onChanged();
  }

  async function remove() {
    if (!task) return;
    if (!confirm(`Supprimer "${task.title}" ?`)) return;
    await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
    onChanged();
    onClose();
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-panel font-sans">
        {/* Header */}
        <header className="px-6 py-3 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)] min-w-0">
            <span className="bg-[var(--color-fg)] text-[var(--color-bg)] px-[6px] py-[1px]">{task.size.toUpperCase()}</span>
            {task.project && <span>› {task.project}</span>}
            <span className="truncate">{task.id}</span>
          </div>
          <button onClick={onClose} aria-label="close" className="font-mono text-[14px] leading-none hover:text-[var(--color-acc-red)]">✕</button>
        </header>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1 min-h-0">
          {!editing ? (
            <>
              <h2 className={`font-display text-[44px] leading-[0.95] tracking-[-0.025em] ${task.done ? 'line-through text-[var(--color-fg-faint)]' : ''}`}>{task.title}</h2>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                {task.tags.map(t => (
                  <span key={t} className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[var(--color-fg)] text-[var(--color-bg)] px-[6px] py-[1px]">{t}</span>
                ))}
                {task.tags.length === 0 && <span className="font-mono text-[10px] uppercase text-[var(--color-fg-faint)]">— NO TAGS</span>}
              </div>

              {/* Markdown body brut */}
              {task.body && task.body.trim().length > 0 && (
                <div className="mt-5 pt-4 border-t border-[var(--color-border-soft)]">
                  <h3 className="font-section mb-2">→ NOTES</h3>
                  <pre className="font-mono text-[12px] leading-[1.6] whitespace-pre-wrap break-words text-[var(--color-fg-muted)]">{task.body.replace(/^#\s+.*\n/, '').trim() || '—'}</pre>
                </div>
              )}

              {task.images.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[var(--color-border-soft)]">
                  <h3 className="font-section mb-2">→ IMAGES</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {task.images.map((src, i) => (
                      <img key={i} src={src} alt={`task image ${i}`} className="brutal-border-soft w-full max-h-[200px] object-cover" />
                    ))}
                  </div>
                </div>
              )}

              {task.links.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[var(--color-border-soft)]">
                  <h3 className="font-section mb-2">→ LINKS</h3>
                  <ul className="space-y-1">
                    {task.links.map((l, i) => (
                      <li key={i}>
                        <a href={l} target="_blank" rel="noopener" className="font-mono text-[12px] underline text-[var(--color-acc-blue)] hover:text-[var(--color-acc-red)] break-all">{l}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-[var(--color-border-soft)] flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                <span>Créé {task.createdAt ? new Date(task.createdAt).toLocaleString('fr-FR') : '?'}</span>
                {task.doneAt && <span>Fait {new Date(task.doneAt).toLocaleString('fr-FR')}</span>}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="font-section">TITLE</span>
                <input ref={titleRef} value={draftTitle} onChange={e => setDraftTitle(e.target.value)} aria-invalid={!draftTitle.trim() ? 'true' : 'false'} className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-sans text-[16px]" />
              </label>
              <label className="block">
                <span className="font-section">PROJECT</span>
                <input value={draftProject} onChange={e => setDraftProject(e.target.value)} placeholder="HUBURTON-OS / GARDEN / vide" className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-mono text-[13px] uppercase" />
              </label>
              <label className="block">
                <span className="font-section">TAGS (séparés par espace)</span>
                <input value={draftTags} onChange={e => setDraftTags(e.target.value)} placeholder="CODE MONEY MOVE …" className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-mono text-[12px] uppercase" />
              </label>
              <label className="block">
                <span className="font-section">BODY — markdown, urls, ![](img)</span>
                <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={8} className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-mono text-[12px] leading-[1.5]" />
              </label>
            </div>
          )}
        </div>

        {/* Footer toolbar */}
        <footer className="px-6 py-3 brutal-border-soft border-t-[1.5px] bg-[var(--color-bg-soft)] flex items-center justify-between gap-3 flex-wrap">
          {!editing ? (
            <>
              <div className="flex items-center gap-1">
                <span className="font-section text-[var(--color-fg-muted)] mr-1">SIZE</span>
                {SIZES.map(s => (
                  <button key={s}
                    onClick={() => changeSize(s)}
                    className={`px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft ${task.size === s ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'hover-paper'}`}
                  >{s}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={toggleDone} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider brutal-border-soft hover-paper">
                  {task.done ? '↺ REOPEN' : '✓ DONE'}
                </button>
                <button onClick={() => setEditing(true)} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider brutal-border-soft hover-paper">
                  ✎ EDIT
                </button>
                <button onClick={remove} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider brutal-border-soft text-[var(--color-acc-red)] hover:bg-[var(--color-acc-red)] hover:text-[var(--color-bg)]">
                  × DELETE
                </button>
              </div>
            </>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[9px] text-[var(--color-fg-faint)]">
                <span className="kbd">Esc</span> cancel · <span className="kbd">⌘↵</span> save
              </span>
              <button onClick={() => setEditing(false)} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider brutal-border-soft hover-paper">CANCEL</button>
              <button onClick={save} disabled={saving || !draftTitle.trim()} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider btn-primary disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'SAVING…' : 'SAVE'}</button>
            </div>
          )}
        </footer>
      </div>
    </>
  );
}
