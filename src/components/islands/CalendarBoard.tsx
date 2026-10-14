import { useEffect, useState, useMemo, useRef } from 'react';

type ViewMode = 'week' | 'month' | 'year';

interface CalEvent {
  id: string; title: string; start: string; end?: string; allDay?: boolean;
  project?: string; color?: string; location?: string; description?: string;
}

const DAYS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const MONTHS = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
const MONTHS_SHORT = ['JAN','FÉV','MAR','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC'];
const COLORS: Record<string, string> = {
  red: 'var(--color-acc-red)', green: 'var(--color-acc-green)', orange: 'var(--color-acc-orange)',
  yellow: 'var(--color-acc-yellow)', blue: 'var(--color-acc-blue)', violet: 'var(--color-acc-violet)',
  fg: 'var(--color-fg)',
};

function weekStart(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0, 0, 0, 0);
  return m;
}
function fmtISO(d: Date) {
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 19);
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
// L'event touche-t-il ce jour ? Multi-jours compris. Fin avec heure : exclusive ; fin en date seule (journée
// entière) : inclusive, comme dans le vault (la conversion vers la fin exclusive de Google se fait côté API)
function coversDay(e: CalEvent, d: Date) {
  const dateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const s = new Date(dateOnly(e.start) ? `${e.start}T00:00:00` : e.start);
  if (sameDay(s, d)) return true;
  if (!e.end) return false;
  const end = new Date(dateOnly(e.end) ? `${e.end}T23:59:59` : e.end);
  const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(d0); d1.setDate(d0.getDate() + 1);
  return s < d1 && end > d0;
}
// Valeur d'input en heure locale (un "…Z" s'affichait en heure UTC) ; date seule (all-day) inchangée
function toInput(s: string) {
  return s.length === 10 || isNaN(Date.parse(s)) ? s : fmtISO(new Date(s));
}
function isoWeek(d: Date) {
  const target = new Date(d.valueOf()); const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

interface EditorProps { event?: CalEvent | null; slot?: { start: Date; end: Date; allDay: boolean } | null; onClose: () => void; onSaved: () => void; }
function EventEditor({ event, slot, onClose, onSaved }: EditorProps) {
  const [title, setTitle] = useState(event?.title || '');
  const [start, setStart] = useState(event?.start ? toInput(event.start) : (slot ? fmtISO(slot.start) : fmtISO(new Date())));
  const [end, setEnd] = useState(event?.end ? toInput(event.end) : (slot ? fmtISO(slot.end) : ''));
  const [allDay, setAllDay] = useState(event?.allDay || slot?.allDay || false);
  const [project, setProject] = useState(event?.project || '');
  const [color, setColor] = useState(event?.color || 'fg');
  const [location, setLocation] = useState(event?.location || '');
  const [description, setDescription] = useState(event?.description || '');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // Décale la fin avec le début (durée gardée) : sinon fin < début → Google refuse, et la sync remet l'ancienne date
  function changeStart(v: string) {
    const delta = new Date(v).getTime() - new Date(start).getTime();
    const e = new Date(new Date(end).getTime() + delta);
    if (end && !isNaN(e.getTime())) setEnd(end.length === 10 ? e.toISOString().slice(0, 10) : fmtISO(e));
    setStart(v);
  }

  async function save() {
    if (!title.trim() || !start || saving) return; // saving : pas de doublon sur ⌘↵ répété
    setSaving(true);
    // null / '' = champ vidé (undefined disparaît du JSON et le PATCH gardait l'ancienne valeur)
    const body = {
      title: title.trim(), start, end: end || null,
      allDay, project: project.trim().toUpperCase() || null,
      color, location: location.trim() || null,
      description: description.trim(),
    };
    if (event) {
      await fetch(`/api/calendar/${event.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    setSaving(false); onSaved(); onClose();
  }
  async function remove() {
    if (!event) return;
    if (!confirm(`Supprimer "${event.title}" ?`)) return;
    await fetch(`/api/calendar/${event.id}`, { method: 'DELETE' });
    onSaved(); onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [title, start, end, allDay, project, color, location, description, saving]);
  // Focus titre à l'ouverture seulement (avant : à chaque frappe, le curseur sautait dans TITLE)
  useEffect(() => { const t = setTimeout(() => titleRef.current?.focus(), 60); return () => clearTimeout(t); }, []);

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-panel">
        <header className="px-4 py-2 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between">
          <span className="font-section">{event ? '✎ EDIT EVENT' : '+ NEW EVENT'}</span>
          <button onClick={onClose} className="font-mono text-[14px] leading-none hover:text-[var(--color-acc-red)]">✕</button>
        </header>
        <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
          <label className="block"><span className="font-section">TITLE</span>
            <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)} aria-invalid={!title.trim() ? 'true' : 'false'} className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-sans text-[14px]" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="font-section">START</span>
              <input type={allDay ? 'date' : 'datetime-local'} value={start.slice(0, allDay ? 10 : 16)} onChange={e => changeStart(e.target.value)} className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-mono text-[12px]" />
            </label>
            <label className="block"><span className="font-section">END (optional)</span>
              <input type={allDay ? 'date' : 'datetime-local'} value={end.slice(0, allDay ? 10 : 16)} onChange={e => setEnd(e.target.value)} className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-mono text-[12px]" />
            </label>
          </div>
          <label className="flex items-center gap-2 font-section">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
            ALL DAY
          </label>
          <label className="block"><span className="font-section">PROJECT</span>
            <input value={project} onChange={e => setProject(e.target.value)} placeholder="HUBURTON-OS / GARDEN / …" className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-mono text-[12px] uppercase" />
          </label>
          <div>
            <span className="font-section">COLOR</span>
            <div className="flex gap-2 mt-1">
              {Object.keys(COLORS).map(k => (
                <button key={k} onClick={() => setColor(k)} className={`w-6 h-6 brutal-border-soft ${color === k ? 'ring-2 ring-offset-1 ring-[var(--color-fg)]' : ''}`} style={{ background: COLORS[k] }} aria-label={k} />
              ))}
            </div>
          </div>
          <label className="block"><span className="font-section">LOCATION</span>
            <input value={location} onChange={e => setLocation(e.target.value)} className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-sans text-[13px]" />
          </label>
          <label className="block"><span className="font-section">DESCRIPTION</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full mt-1 px-2 py-1 brutal-border-soft bg-[var(--color-bg)] font-sans text-[12px]" />
          </label>
        </div>
        <footer className="px-4 py-3 brutal-border-soft border-t-[1.5px] bg-[var(--color-bg-soft)] flex items-center justify-between gap-3">
          {event ? <button onClick={remove} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider brutal-border-soft text-[var(--color-acc-red)] hover:bg-[var(--color-acc-red)] hover:text-[var(--color-bg)]">× DELETE</button> : <span />}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-[var(--color-fg-faint)]"><span className="kbd">Esc</span> close · <span className="kbd">⌘↵</span> save</span>
            <button onClick={onClose} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider brutal-border-soft hover-paper">CANCEL</button>
            <button onClick={save} disabled={saving || !title.trim() || !start} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider btn-primary disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'SAVING…' : 'SAVE'}</button>
          </div>
        </footer>
      </div>
    </>
  );
}

function WeekView({ anchor, events, onSlot, onEvent }: { anchor: Date; events: CalEvent[]; onSlot: (s: any) => void; onEvent: (e: CalEvent) => void }) {
  const start = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const today = new Date();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // scroll initial à 8h (chaque slot = 44px), centré un peu plus haut
    if (scrollerRef.current) scrollerRef.current.scrollTop = 8 * 44 - 20;
  }, []);
  return (
    <div className="grid grid-cols-[48px_repeat(7,1fr)] flex-1 min-h-0 overflow-hidden">
      <div className="border-b-[1.5px] border-r-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-soft)] sticky top-0 z-10"></div>
      {days.map((d, i) => {
        const isT = sameDay(d, today);
        const dayEvents = events.filter(e => e.allDay && coversDay(e, d));
        return (
          <div key={i} className={`border-b-[1.5px] border-r-[1.5px] last:border-r-0 border-[var(--color-border)] px-2 py-1 sticky top-0 z-10 ${isT ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'bg-[var(--color-bg-soft)]'} anim-fade-in`}>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold">{DAYS[i]}</div>
            <div className={`font-display text-[18px] leading-none mt-[1px] ${isT ? '' : 'text-[var(--color-fg-muted)]'}`}>{String(d.getDate()).padStart(2,'0')}.</div>
            {dayEvents.length > 0 && (
              <div className="mt-1 space-y-[2px]">
                {dayEvents.map(ev => (
                  <button key={ev.id} onClick={() => onEvent(ev)} className="block w-full text-left px-[5px] py-[1px] font-mono text-[9px] uppercase truncate" style={{ background: COLORS[ev.color || 'fg'], color: 'var(--color-bg)' }}>{ev.title}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div ref={scrollerRef} className="overflow-y-auto col-span-8 grid grid-cols-[48px_repeat(7,1fr)]">
        {hours.map(h => (
          <div className="contents" key={`r-${h}`}>
            <div className="border-b border-r-[1.5px] border-[var(--color-border-soft)] bg-[var(--color-bg-soft)] px-1 font-mono text-[9px] text-[var(--color-fg-muted)] tabular-nums h-[44px] flex items-start justify-end pt-1">
              {String(h).padStart(2,'0')}H
            </div>
            {days.map((d, i) => {
              const slotStart = new Date(d); slotStart.setHours(h, 0, 0, 0);
              const slotEnd = new Date(d); slotEnd.setHours(h + 1, 0, 0, 0);
              const slotEvents = events.filter(e => {
                if (e.allDay) return false;
                const es = new Date(e.start);
                return sameDay(es, d) && es.getHours() === h;
              });
              return (
                <button key={`${i}-${h}`} onClick={() => onSlot({ start: slotStart, end: slotEnd, allDay: false })} className="border-b border-r-[1.5px] last:border-r-0 border-[var(--color-border-soft)] h-[44px] hover-paper relative text-left p-[2px]">
                  {slotEvents.map(ev => {
                    const es = new Date(ev.start);
                    const ee = ev.end ? new Date(ev.end) : new Date(es.getTime() + 30 * 60 * 1000);
                    const durMin = Math.max(15, Math.min(24 * 60, (ee.getTime() - es.getTime()) / 60000));
                    const heightPx = (durMin / 60) * 44;
                    return (
                      <div key={ev.id} onClick={(e) => { e.stopPropagation(); onEvent(ev); }} className="absolute left-[2px] right-[2px] px-[4px] py-[1px] cursor-pointer overflow-hidden brutal-border-soft anim-fade-in" style={{ background: COLORS[ev.color || 'fg'], color: 'var(--color-bg)', top: `${(es.getMinutes() / 60) * 44}px`, height: `${heightPx}px`, minHeight: '14px' }}>
                        <div className="font-mono text-[9px] uppercase tracking-wider truncate font-bold">{ev.title}</div>
                        {durMin >= 30 && ev.location && <div className="font-mono text-[8px] opacity-80 truncate">{ev.location}</div>}
                      </div>
                    );
                  })}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthView({ anchor, events, onDay, onEvent }: { anchor: Date; events: CalEvent[]; onDay: (d: Date) => void; onEvent: (e: CalEvent) => void }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = weekStart(first);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  const today = new Date();
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="grid grid-cols-7 border-b-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-soft)] shrink-0">
        {DAYS.map(d => <div key={d} className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] font-bold">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
        {days.map((d, i) => {
          const inMonth = sameMonth(d, anchor);
          const isT = sameDay(d, today);
          const dayEvents = events.filter(e => coversDay(e, d));
          return (
            <button key={i} onClick={() => onDay(d)} className={`border-r border-b border-[var(--color-border-soft)] text-left p-1 overflow-hidden ${inMonth ? 'bg-[var(--color-bg-paper)]' : 'bg-[var(--color-bg-soft)] opacity-40'} hover:bg-[var(--color-bg-elev)] flex flex-col gap-[2px]`}>
              <span className={`font-display text-[16px] leading-none ${isT ? 'bg-[var(--color-fg)] text-[var(--color-bg)] px-1 inline-block' : ''}`}>{String(d.getDate()).padStart(2,'0')}.</span>
              <div className="flex-1 space-y-[1px] overflow-hidden">
                {dayEvents.slice(0, 3).map(ev => (
                  <div key={ev.id} onClick={e => { e.stopPropagation(); onEvent(ev); }} className="px-[3px] font-mono text-[8px] uppercase tracking-wider truncate cursor-pointer" style={{ background: COLORS[ev.color || 'fg'], color: 'var(--color-bg)' }}>{ev.title}</div>
                ))}
                {dayEvents.length > 3 && <div className="font-mono text-[8px] text-[var(--color-fg-muted)]">+{dayEvents.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YearView({ anchor, events, onMonth }: { anchor: Date; events: CalEvent[]; onMonth: (d: Date) => void }) {
  const today = new Date();
  return (
    <div className="grid grid-cols-3 md:grid-cols-4 gap-3 p-4 overflow-y-auto flex-1 min-h-0">
      {MONTHS.map((m, i) => {
        const first = new Date(anchor.getFullYear(), i, 1);
        const monthStart = weekStart(first);
        const days = Array.from({ length: 42 }, (_, k) => { const d = new Date(monthStart); d.setDate(monthStart.getDate() + k); return d; });
        const monthEvents = events.filter(e => { const d = new Date(e.start); return d.getFullYear() === anchor.getFullYear() && d.getMonth() === i; });
        const isCurrentMonth = anchor.getFullYear() === today.getFullYear() && i === today.getMonth();
        return (
          <button key={i} onClick={() => onMonth(new Date(anchor.getFullYear(), i, 1))} className={`brutal-border ${isCurrentMonth ? 'bg-[var(--color-bg-elev)] ring-2 ring-[var(--color-fg)]' : 'bg-[var(--color-bg-paper)]'} hover-paper p-2 text-left`}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-display text-[20px]">{m}</span>
              {monthEvents.length > 0 && <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)]">{monthEvents.length} EV</span>}
            </div>
            <div className="grid grid-cols-7 gap-[1px]">
              {DAYS.map(d => <div key={d} className="font-mono text-[7px] uppercase text-[var(--color-fg-faint)] text-center">{d[0]}</div>)}
              {days.map((d, k) => {
                const inMonth = d.getMonth() === i;
                const isT = sameDay(d, today);
                const hasEv = monthEvents.some(e => sameDay(new Date(e.start), d));
                return (
                  <div key={k} className={`text-center font-mono text-[8px] tabular-nums py-[1px] ${inMonth ? '' : 'opacity-30'} ${isT ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : hasEv ? 'bg-[var(--color-acc-blue)] text-[var(--color-bg)]' : ''}`}>{d.getDate()}</div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function CalendarBoard() {
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [slot, setSlot] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [gcal, setGcal] = useState<{ configured: boolean; connected: boolean; expiresAt?: number } | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    const from = new Date(anchor.getFullYear(), view === 'year' ? 0 : anchor.getMonth() - 1, 1).toISOString();
    // jour 1 du mois suivant (pas jour 0 = dernier jour à 00:00, qui excluait ce jour-là, ex. 31 déc. en vue année)
    const to = new Date(anchor.getFullYear() + (view === 'year' ? 1 : 0), view === 'year' ? 0 : anchor.getMonth() + 2, 1).toISOString();
    const r = await fetch(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(r => r.json());
    setEvents(r.events || []);
  }
  async function refreshGcalStatus() {
    try { setGcal(await fetch('/api/google/status').then(r => r.json())); } catch { setGcal(null); }
  }
  async function syncGcalNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await fetch('/api/google/sync', { method: 'POST' }).then(r => r.json());
      console.log('[gcal] sync result', r);
      await refresh();
    } finally { setSyncing(false); }
  }
  async function disconnectGcal() {
    if (!confirm('Déconnecter Google Calendar ? Les events déjà importés restent dans le vault.')) return;
    await fetch('/api/google/disconnect', { method: 'POST' });
    await refreshGcalStatus();
  }
  useEffect(() => { refresh(); }, [anchor, view]);
  useEffect(() => {
    refreshGcalStatus();
    const i = setInterval(refreshGcalStatus, 60_000);
    return () => clearInterval(i);
  }, []);

  function nav(dir: number) {
    const next = new Date(anchor);
    if (view === 'week') next.setDate(next.getDate() + dir * 7);
    else if (view === 'month') { next.setDate(1); next.setMonth(next.getMonth() + dir); } // le 31 + 1 mois sautait un mois
    else next.setFullYear(next.getFullYear() + dir);
    setAnchor(next);
  }

  // Navigation clavier : ← → = prev/next, ↑ ↓ = changement de vue, t = today, w/m/y = vue directe.
  // Skip si focus dans input/textarea/select pour pas casser les forms.
  useEffect(() => {
    function isTyping(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (showEditor) return;
      const views: ViewMode[] = ['week', 'month', 'year'];
      const idx = views.indexOf(view);
      if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx < views.length - 1) setView(views[idx + 1]); // week → month → year
      }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx > 0) setView(views[idx - 1]); // year → month → week
      }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); setAnchor(new Date()); }
      else if (e.key === 'w' || e.key === 'W') { e.preventDefault(); setView('week'); }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setView('month'); }
      else if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); setView('year'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, anchor, showEditor]);

  const monthLabel = useMemo(() => {
    if (view === 'week') {
      const s = weekStart(anchor); const e = new Date(s); e.setDate(s.getDate() + 6);
      // si même mois, on n'affiche le mois qu'une fois
      if (s.getMonth() === e.getMonth()) {
        return { main: `${MONTHS[s.getMonth()]} ${s.getFullYear()}`, sub: `S${isoWeek(anchor)} · ${s.getDate()} → ${e.getDate()}` };
      }
      return { main: `${MONTHS_SHORT[s.getMonth()]} → ${MONTHS_SHORT[e.getMonth()]} ${e.getFullYear()}`, sub: `S${isoWeek(anchor)} · ${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} → ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}` };
    }
    if (view === 'month') return { main: `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`, sub: '' };
    return { main: `${anchor.getFullYear()}`, sub: '' };
  }, [anchor, view]);

  function handleEvent(ev: CalEvent) { setEditing(ev); setSlot(null); setShowEditor(true); }
  function handleSlot(s: any) { setSlot(s); setEditing(null); setShowEditor(true); }

  return (
    <div className="flex flex-col h-full overflow-hidden anim-fade-in">
      <header className="px-4 md:px-6 pt-3 pb-2 brutal-border-bottom flex items-end justify-between gap-3 shrink-0 flex-wrap">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">{monthLabel.sub}</p>
          <h1 className="font-display text-[clamp(48px,6.5vw,84px)] mt-1 leading-none">{monthLabel.main}.</h1>
        </div>
        <div className="flex items-center gap-2 pb-2 flex-wrap">
          <button onClick={() => setAnchor(new Date())} className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft hover-paper">TODAY</button>
          <div className="flex">
            <button onClick={() => nav(-1)} className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[12px] brutal-border-soft hover-paper">‹</button>
            <button onClick={() => nav(1)} className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[12px] brutal-border-soft border-l-0 hover-paper">›</button>
          </div>
          <div className="flex">
            {(['week', 'month', 'year'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft ${v !== 'week' ? 'border-l-0' : ''} ${view === v ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'hover-paper'}`}>{v}</button>
            ))}
          </div>
          <button onClick={() => { setEditing(null); setSlot(null); setShowEditor(true); }} className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[10px] uppercase tracking-wider bg-[var(--color-acc-red)] text-[var(--color-bg)] hover:bg-[var(--color-fg)]">+ EVENT</button>

          {gcal && (
            <div className="flex items-center gap-1 pl-2 ml-1 border-l border-[var(--color-border-soft)]">
              {!gcal.configured && (
                <span title="Variables d'env GOOGLE_CLIENT_ID/SECRET manquantes" className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft text-[var(--color-fg-faint)] cursor-help">GCAL · ENV?</span>
              )}
              {gcal.configured && !gcal.connected && (
                <a href="/api/google/auth" className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[10px] uppercase tracking-wider bg-[var(--color-acc-blue)] text-[var(--color-bg)] hover:opacity-80">+ GCAL CONNECT</a>
              )}
              {gcal.connected && (
                <>
                  <span className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[10px] uppercase tracking-wider text-[var(--color-acc-green)] flex items-center gap-1"><span className="w-[6px] h-[6px] rounded-full bg-[var(--color-acc-green)]"/>GCAL</span>
                  <button onClick={syncGcalNow} disabled={syncing} className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft hover-paper disabled:opacity-50">{syncing ? '⟳…' : '⟳ SYNC'}</button>
                  <button onClick={disconnectGcal} title="Déconnecter Google" className="px-3 md:px-2 py-[8px] md:py-[3px] font-mono text-[10px] brutal-border-soft hover:text-[var(--color-acc-red)]">×</button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {view === 'week' && (
        // téléphone : la semaine garde des colonnes lisibles et défile à l'horizontale
        <div className="flex-1 min-h-0 overflow-x-auto flex flex-col">
          <div className="min-w-[720px] md:min-w-0 flex-1 min-h-0 flex flex-col">
            <WeekView anchor={anchor} events={events} onSlot={handleSlot} onEvent={handleEvent} />
          </div>
        </div>
      )}
      {view === 'month' && <MonthView anchor={anchor} events={events} onDay={d => { setAnchor(d); setView('week'); }} onEvent={handleEvent} />}
      {view === 'year' && <YearView anchor={anchor} events={events} onMonth={d => { setAnchor(d); setView('month'); }} />}

      <footer className="hidden md:flex shrink-0 px-6 py-1 border-t-[1.5px] border-[var(--color-border)] bg-[var(--color-bg-soft)] items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
        <span>{events.length} EVENTS · ← → NAV · ↑ ↓ VIEW · T TODAY · CLICK TO EDIT</span>
        <span>VAULT → ~/vault/20-tasks/calendar/</span>
      </footer>

      {showEditor && <EventEditor event={editing} slot={slot} onClose={() => setShowEditor(false)} onSaved={refresh} />}
    </div>
  );
}
