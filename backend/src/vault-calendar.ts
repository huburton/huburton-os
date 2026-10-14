import { readdir, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { VAULT_ROOT } from './config.ts';
import { walkMd, slug, toFrontmatter } from './vault-fs.ts';

const CAL_DIR = join(VAULT_ROOT, '20-tasks', 'calendar');

export interface CalEvent {
  id: string;
  title: string;
  start: string;   // ISO datetime
  end?: string;    // ISO datetime
  allDay?: boolean;
  project?: string;
  color?: string;  // hex or semantic key
  location?: string;
  description?: string;
  googleEventId?: string;
  filePath: string;
}

// Google refuse "2026-09-29T23:30" (valeur brute d'un input datetime-local, sans secondes) :
// l'event n'était jamais poussé, ou la modif refusée puis écrasée par la sync suivante
function withSeconds(s: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
}

export async function loadCalEvents(from?: string, to?: string): Promise<CalEvent[]> {
  const out: CalEvent[] = [];
  try { await stat(CAL_DIR); } catch { return out; }
  const fromTs = from ? Date.parse(from) : 0;
  const toTs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  for await (const file of walkMd(CAL_DIR)) {
    const raw = await readFile(file, 'utf8');
    const { data, content } = matter(raw);
    if (data.type !== 'event') continue;
    const startTs = Date.parse(data.start as string || '');
    const endTs = data.end ? Date.parse(data.end as string) : startTs;
    if (endTs < fromTs || startTs > toTs) continue;
    out.push({
      id: (data.id as string) || basename(file, '.md'),
      title: (data.title as string) || basename(file, '.md'),
      start: data.start as string,
      end: data.end as string | undefined,
      allDay: Boolean(data.allDay),
      project: data.project as string | undefined,
      color: data.color as string | undefined,
      location: data.location as string | undefined,
      description: content?.trim() || undefined,
      googleEventId: data.googleEventId as string | undefined,
      filePath: file,
    });
  }
  out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return out;
}

export async function createCalEvent(input: {
  title: string; start: string; end?: string; allDay?: boolean;
  project?: string; color?: string; location?: string; description?: string;
  googleEventId?: string;
}): Promise<CalEvent> {
  input = { ...input, start: withSeconds(input.start), end: input.end ? withSeconds(input.end) : input.end };
  const startDate = new Date(input.start);
  // Date telle qu'écrite (heure de Paris) : toISOString passe en UTC (conteneur) → 00:30 le 1er oct. rangé en 2026-09
  const ymd = /^\d{4}-\d{2}-\d{2}/.test(input.start) ? input.start.slice(0, 10) : startDate.toISOString().slice(0, 10);
  const id = `${ymd}-${slug(input.title)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  const dir = join(CAL_DIR, ymd.slice(0, 7));
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${id}.md`);

  const fm: Record<string, unknown> = {
    type: 'event',
    id,
    title: input.title,
    start: input.start,
    end: input.end,
    allDay: input.allDay || false,
    project: input.project,
    color: input.color,
    location: input.location,
    googleEventId: input.googleEventId,
    created_at: new Date().toISOString(),
  };
  await writeFile(filePath, `${toFrontmatter(fm)}\n${input.description || ''}\n`, 'utf8');
  return {
    id, title: input.title, start: input.start, end: input.end, allDay: input.allDay,
    project: input.project, color: input.color, location: input.location,
    description: input.description, googleEventId: input.googleEventId, filePath,
  };
}

// Patch frontmatter sans toucher au contenu : sert pour stocker googleEventId après push.
export async function patchEventFrontmatter(id: string, patch: Record<string, unknown>): Promise<boolean> {
  try { await stat(CAL_DIR); } catch { return false; }
  for await (const file of walkMd(CAL_DIR)) {
    if (file.includes(id)) {
      const raw = await readFile(file, 'utf8');
      const { data, content } = matter(raw);
      Object.assign(data, patch);
      await writeFile(file, `${toFrontmatter(data)}\n${content || ''}`, 'utf8');
      return true;
    }
  }
  return false;
}

export async function updateCalEvent(id: string, patch: Partial<{
  title: string; start: string; end: string | null; allDay: boolean;
  project: string | null; color: string | null; location: string | null; description: string;
  googleEventId: string | null;
}>): Promise<CalEvent | null> {
  let target: string | null = null;
  try { await stat(CAL_DIR); } catch { return null; }
  for await (const file of walkMd(CAL_DIR)) {
    if (file.includes(id)) { target = file; break; }
  }
  if (!target) return null;
  const raw = await readFile(target, 'utf8');
  const { data, content } = matter(raw);
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.start !== undefined) data.start = withSeconds(patch.start);
  if (patch.end !== undefined) data.end = patch.end ? withSeconds(patch.end) : undefined;
  if (patch.allDay !== undefined) data.allDay = patch.allDay;
  if (patch.project !== undefined) data.project = patch.project || undefined;
  if (patch.color !== undefined) data.color = patch.color || undefined;
  if (patch.location !== undefined) data.location = patch.location || undefined;
  if (patch.googleEventId !== undefined) data.googleEventId = patch.googleEventId || undefined;
  const newDescription = patch.description !== undefined ? patch.description : content;
  await writeFile(target, `${toFrontmatter(data)}\n${newDescription || ''}\n`, 'utf8');
  return (await loadCalEvents()).find(e => e.id === id) || null;
}

export async function deleteCalEvent(id: string): Promise<boolean> {
  try { await stat(CAL_DIR); } catch { return false; }
  for await (const file of walkMd(CAL_DIR)) {
    if (file.includes(id)) {
      await rm(file, { force: true });
      return true;
    }
  }
  return false;
}

export async function bulkCreateCalEvents(events: Array<any>): Promise<CalEvent[]> {
  const created: CalEvent[] = [];
  for (const e of events) {
    if (!e.title || !e.start) continue;
    created.push(await createCalEvent(e));
  }
  return created;
}
