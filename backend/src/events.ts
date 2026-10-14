export interface Event {
  id: string;
  ts: number;
  source: string; // claude-code, system, manual
  kind: string;   // session-start, tool-use, session-end, capture, deploy, etc.
  title: string;
  detail?: string;
  level?: 'info' | 'ok' | 'warn' | 'err';
}

const BUFFER_MAX = 200;
const events: Event[] = [];
const subscribers = new Set<(e: Event) => void>();

export function addEvent(e: Omit<Event, 'id' | 'ts'> & Partial<Pick<Event, 'ts' | 'id'>>): Event {
  const full: Event = {
    id: e.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: e.ts || Date.now(),
    source: e.source,
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    level: e.level || 'info',
  };
  events.unshift(full);
  if (events.length > BUFFER_MAX) events.length = BUFFER_MAX;
  for (const cb of subscribers) {
    try { cb(full); } catch { /* ignore */ }
  }
  return full;
}

export function getEvents(limit = 100): Event[] {
  return events.slice(0, limit);
}

export function subscribe(cb: (e: Event) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

// Seed avec un event de démarrage backend pour visualiser
addEvent({
  source: 'system',
  kind: 'service-up',
  title: 'plateforme-api online',
  detail: 'backend Bun + Hono démarré, vault mounted, events buffer init',
  level: 'ok',
});
