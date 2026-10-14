import { useEffect, useState } from 'react';

interface CalEvent {
  id: string; title: string; start: string; end?: string; allDay?: boolean;
  project?: string; color?: string; location?: string;
}

const COLORS: Record<string, string> = {
  red: 'var(--color-acc-red)', green: 'var(--color-acc-green)', orange: 'var(--color-acc-orange)',
  yellow: 'var(--color-acc-yellow)', blue: 'var(--color-acc-blue)', violet: 'var(--color-acc-violet)',
  fg: 'var(--color-fg)',
};
const DAYS = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
const MONTHS = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtHM(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function EventRow({ ev }: { ev: CalEvent }) {
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : null;
  return (
    <div className="grid grid-cols-[10px_92px_1fr_auto] gap-2 items-center px-3 py-[6px] border-b border-[var(--color-border-soft)] last:border-b-0 hover-paper">
      <span className="w-[10px] h-[10px] shrink-0" style={{ background: COLORS[ev.color || 'fg'] }} />
      <span className="font-mono text-[10px] tabular-nums text-[var(--color-fg-muted)] whitespace-nowrap">
        {ev.allDay ? 'TOUTE LA J.' : end ? `${fmtHM(ev.start)} → ${fmtHM(ev.end!)}` : fmtHM(ev.start)}
      </span>
      <span className="font-sans text-[12px] truncate">{ev.title}</span>
      {ev.project && <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] shrink-0">› {ev.project}</span>}
    </div>
  );
}

export default function CalendarToday() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inTwoDays = new Date(today); inTwoDays.setDate(today.getDate() + 2);
    inTwoDays.setHours(23, 59, 59, 999);
    try {
      const r = await fetch(`/api/calendar?from=${encodeURIComponent(today.toISOString())}&to=${encodeURIComponent(inTwoDays.toISOString())}`).then(r => r.json());
      setEvents(r.events || []);
    } finally { setLoading(false); }
  }
  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 60_000);
    return () => clearInterval(i);
  }, []);

  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const todayEvents = events.filter(e => sameDay(new Date(e.start), today));
  const tomorrowEvents = events.filter(e => sameDay(new Date(e.start), tomorrow));

  return (
    <section className="brutal-border bg-[var(--color-bg-paper)] flex flex-col min-h-0 anim-slide-up" style={{ animationDelay: '280ms' }}>
      <header className="px-3 py-1 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between shrink-0">
        <h3 className="font-section">
          ⌘ AUJOURD'HUI · {DAYS[today.getDay()]} {String(today.getDate()).padStart(2, '0')} {MONTHS[today.getMonth()]}
        </h3>
        <a href="/planning" className="font-mono text-[9px] uppercase tracking-wider underline">PLANNING →</a>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="px-3 py-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">LOADING…</div>
        ) : todayEvents.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— RIEN DE PRÉVU AUJOURD'HUI —</div>
        ) : todayEvents.map(ev => <EventRow key={ev.id} ev={ev} />)}

        {/* Aperçu demain */}
        <div className="px-3 py-1 border-t-[1.5px] border-[var(--color-border)] bg-[var(--color-bg)]">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
            → DEMAIN · {DAYS[tomorrow.getDay()]} {String(tomorrow.getDate()).padStart(2, '0')} {MONTHS[tomorrow.getMonth()]} · {tomorrowEvents.length}
          </h4>
        </div>
        {tomorrowEvents.length === 0 ? (
          <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] text-center">— RIEN —</div>
        ) : tomorrowEvents.slice(0, 6).map(ev => <EventRow key={ev.id} ev={ev} />)}
      </div>
    </section>
  );
}
