// Google Calendar OAuth 2.0 + sync bidirectionnel vers le vault
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createCalEvent, updateCalEvent, loadCalEvents, deleteCalEvent } from './vault-calendar.ts';
import { PUBLIC_URL, TIME_ZONE, VAULT_ROOT } from './config.ts';

const TOKEN_FILE = join(VAULT_ROOT, '.config', 'google-token.json');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${PUBLIC_URL}/api/google/callback`;
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';

interface Token { access_token: string; refresh_token?: string; expires_at: number; }

async function readToken(): Promise<Token | null> {
  try {
    const raw = await readFile(TOKEN_FILE, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}
async function writeToken(t: Token): Promise<void> {
  await mkdir(join(VAULT_ROOT, '.config'), { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify(t, null, 2), 'utf8');
}

export function isConfigured(): boolean {
  return !!CLIENT_ID && !!CLIENT_SECRET;
}

export function authorizeUrl(state: string = 'gcal'): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', REDIRECT_URI);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  return u.toString();
}

export async function exchangeCode(code: string): Promise<Token | null> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
    }).toString(),
  });
  if (!r.ok) return null;
  const d = await r.json() as any;
  const t: Token = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
  };
  await writeToken(t);
  return t;
}

async function refreshAccessToken(t: Token): Promise<Token | null> {
  if (!t.refresh_token) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: t.refresh_token,
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!r.ok) return null;
  const d = await r.json() as any;
  const next: Token = {
    access_token: d.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
  };
  await writeToken(next);
  return next;
}

async function getValidToken(): Promise<Token | null> {
  let t = await readToken();
  if (!t) return null;
  if (Date.now() >= t.expires_at - 60000) {
    t = await refreshAccessToken(t);
  }
  return t;
}

export async function status(): Promise<{ configured: boolean; connected: boolean; expiresAt?: number }> {
  // Jeton renouvelé si besoin : un refresh token révoqué (invalid_grant) = déconnecté → bouton « + GCAL CONNECT »
  const t = await getValidToken();
  return { configured: isConfigured(), connected: !!t, expiresAt: t?.expires_at };
}

interface LocalEvent {
  title: string; start: string; end?: string; allDay?: boolean;
  location?: string; description?: string;
}

// Journée entière : Google veut une date de fin EXCLUSIVE (event du 24 → fin le 25), le vault garde une fin inclusive
function shiftDay(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// VAULT → GOOGLE : créer un event sur Google Cal, retourne le googleEventId
export async function pushEvent(local: LocalEvent): Promise<string | null> {
  const t = await getValidToken();
  if (!t) return null;
  const body: any = {
    summary: local.title,
    start: local.allDay
      ? { date: local.start.slice(0, 10) }
      : { dateTime: local.start, timeZone: TIME_ZONE },
    end: local.allDay
      ? { date: shiftDay(local.end || local.start, 1) }
      : { dateTime: local.end || local.start, timeZone: TIME_ZONE },
  };
  if (local.location) body.location = local.location;
  if (local.description) body.description = local.description;
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const d = await r.json() as any;
  return d.id || null;
}

export async function updateRemoteEvent(googleEventId: string, patch: Partial<LocalEvent>): Promise<boolean> {
  const t = await getValidToken();
  if (!t) return false;
  const body: any = {};
  if (patch.title !== undefined) body.summary = patch.title;
  if (patch.start !== undefined) {
    body.start = patch.allDay
      ? { date: patch.start.slice(0, 10) }
      : { dateTime: patch.start, timeZone: TIME_ZONE };
  }
  if (patch.end !== undefined) {
    body.end = patch.allDay
      ? { date: shiftDay(patch.end, 1) }
      : { dateTime: patch.end, timeZone: TIME_ZONE };
  }
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.description !== undefined) body.description = patch.description;
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.ok;
}

export async function deleteRemoteEvent(googleEventId: string): Promise<boolean> {
  const t = await getValidToken();
  if (!t) return false;
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  return r.ok || r.status === 410; // 410 = already deleted
}

export async function disconnect(): Promise<void> {
  try {
    await writeFile(TOKEN_FILE, JSON.stringify({}, null, 2), 'utf8');
  } catch {}
}

// Pur (testable) : events locaux liés à Google à retirer du vault.
// cancelled = annulés dans la liste Google (showDeleted) → suppression directe ;
// missing = absents de la liste mais dans la fenêtre demandée (fin > timeMin, début < timeMax,
// même filtre que Google) → à confirmer un par un avant suppression.
// Un event sans googleEventId (jamais poussé) n'est jamais retenu.
export function staleLocalEvents<T extends { start: string; end?: string; googleEventId?: string }>(
  local: T[], remote: Array<{ id: string; status?: string }>, timeMin: number, timeMax: number,
): { cancelled: T[]; missing: T[] } {
  const remoteStatus = new Map(remote.map(ev => [ev.id, ev.status]));
  const cancelled: T[] = [], missing: T[] = [];
  for (const e of local) {
    if (!e.googleEventId) continue;
    if (remoteStatus.has(e.googleEventId)) {
      if (remoteStatus.get(e.googleEventId) === 'cancelled') cancelled.push(e);
      continue;
    }
    const startTs = Date.parse(e.start);
    const endTs = e.end ? Date.parse(e.end) : startTs;
    if (endTs > timeMin && startTs < timeMax) missing.push(e); // NaN → exclu
  }
  return { cancelled, missing };
}

// Supprimé côté Google ? Seulement si Google le dit (200 + "cancelled", ou 410).
// 404 (autre compte/agenda ?) ou erreur réseau/auth → on garde l'event local.
async function isRemoteCancelled(accessToken: string, googleEventId: string): Promise<boolean> {
  try {
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (r.status === 410) return true;
    return r.ok && ((await r.json()) as any).status === 'cancelled';
  } catch { return false; }
}

// GOOGLE → VAULT : pull les events, créé les nouveaux, update les existants (matching par googleEventId),
// supprime du vault ceux supprimés/annulés côté Google
export async function syncEvents(daysAhead = 60): Promise<{ imported: number; updated: number; deleted: number; errors: string[] }> {
  const t = await getValidToken();
  if (!t) return { imported: 0, updated: 0, deleted: 0, errors: ['not authenticated'] };

  // Index events locaux par googleEventId — chargés AVANT l'appel Google : un event poussé
  // pendant la sync n'a pas encore son googleEventId ici, il ne peut donc pas être vu « absent »
  const existing = await loadCalEvents();
  const byGoogleId = new Map<string, { id: string }>();
  for (const e of existing) {
    const gid = (e as any).googleEventId as string | undefined;
    if (gid) byGoogleId.set(gid, { id: e.id });
  }

  const now = new Date();
  const horizon = new Date(now); horizon.setDate(now.getDate() + daysAhead);
  // Toutes les pages, sinon rien : aucun import ni suppression sur une liste partielle.
  // showDeleted → les events supprimés reviennent avec status "cancelled"
  const items: any[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', now.toISOString());
    url.searchParams.set('timeMax', horizon.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');
    url.searchParams.set('showDeleted', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${t.access_token}` } });
    if (!r.ok) return { imported: 0, updated: 0, deleted: 0, errors: [`HTTP ${r.status}`] };
    const data = await r.json() as any;
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  let imported = 0, updated = 0, deleted = 0;
  const errors: string[] = [];
  for (const ev of items) {
    if (ev.status === 'cancelled') continue; // supprimé côté Google : traité plus bas, surtout pas importé
    try {
      const start = ev.start?.dateTime || ev.start?.date;
      let endStr = ev.end?.dateTime || ev.end?.date;
      if (ev.start?.date && ev.end?.date) {  // fin exclusive de Google → inclusive (jamais avant le début)
        endStr = shiftDay(ev.end.date, -1);
        if (endStr < ev.start.date) endStr = ev.start.date;
      }
      if (!start) continue;
      const matched = byGoogleId.get(ev.id);
      if (matched) {
        await updateCalEvent(matched.id, {
          title: ev.summary || '(sans titre)',
          start, end: endStr || null,
          allDay: !!ev.start?.date,
          location: ev.location || null,
          description: ev.description,
        });
        updated++;
      } else {
        await createCalEvent({
          title: ev.summary || '(sans titre)',
          start, end: endStr,
          allDay: !!ev.start?.date,
          location: ev.location,
          description: ev.description,
          color: 'blue',
          project: 'GCAL',
          googleEventId: ev.id,
        });
        imported++;
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  // Suppressions : annulés dans la liste → direct ; absents de la fenêtre → confirmés par un GET
  const { cancelled, missing } = staleLocalEvents(existing, items, now.getTime(), horizon.getTime());
  for (const e of missing) {
    if (await isRemoteCancelled(t.access_token, e.googleEventId!)) cancelled.push(e);
  }
  for (const e of cancelled) {
    try {
      if (await deleteCalEvent(e.id)) deleted++;
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  return { imported, updated, deleted, errors };
}

// Scheduler : pull Google → vault toutes les 15 min
let _gsyncStarted = false;
export function startGoogleSyncScheduler() {
  if (_gsyncStarted) return;
  _gsyncStarted = true;
  const tick = async () => {
    if (!isConfigured()) return;
    const t = await readToken();
    if (!t) return; // not connected
    try {
      const r = await syncEvents(60);
      if (r.imported || r.updated || r.deleted) {
        console.log(`[gcal] sync : +${r.imported} new, ~${r.updated} updated, -${r.deleted} deleted`);
      }
    } catch (e) {
      console.warn('[gcal] sync failed', e);
    }
  };
  setInterval(tick, 15 * 60 * 1000);
  // First tick after 30s pour ne pas bloquer le boot
  setTimeout(tick, 30_000);
}
