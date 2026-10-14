// API routes exercised with Hono's app.request() against a fresh copy of demo-vault/ (see setup.ts).
import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import app from '../src/app.ts';
import { localYmd, addDays } from '../src/dates.ts';

const body = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const json = (method: string, body: unknown) => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('health and disabled integrations', () => {
  test('GET /api/health', async () => {
    const r = await app.request('/api/health');
    expect(r.status).toBe(200);
    expect((await body(r)).ok).toBe(true);
  });
  test('agent, Google Calendar and weather report themselves as off without keys', async () => {
    expect(await body(app.request('/api/agent/status'))).toEqual({ ok: false });
    expect((await app.request('/api/agent', json('POST', { prompt: 'hi' }))).status).toBe(503);
    const g = await body(app.request('/api/google/status'));
    expect(g).toMatchObject({ configured: false, connected: false });
    expect((await app.request('/api/weather')).status).toBe(500);
  });
});

describe('tasks: vault notes as records', () => {
  test('lists the demo tasks sorted by order', async () => {
    const { tasks } = await body(app.request('/api/tasks'));
    expect(tasks.length).toBe(13);
    expect(tasks[0].id).toBe('write-readme-architecture');
    expect(tasks.find((t: any) => t.id === 'order-soil-sensor')).toMatchObject({ done: true, project: 'GARDEN', size: 'small' });
  });

  test('project counts are derived from task frontmatter', async () => {
    const { projects } = await body(app.request('/api/projects'));
    expect(projects.find((p: any) => p.name === 'GARDEN')).toEqual({ name: 'GARDEN', total: 3, done: 1 });
  });

  test('create, complete and delete a task round-trip through a Markdown file', async () => {
    const created = await app.request('/api/tasks', json('POST', { title: 'Buy: "wood glue"', size: 'medium', tags: ['BUY'], project: 'BOOKSHELF' }));
    expect(created.status).toBe(201);
    const { task } = await body(created);
    expect(task.filePath.startsWith(process.env.VAULT_ROOT!)).toBe(true);

    const onDisk = matter(await readFile(task.filePath, 'utf8'));
    expect(onDisk.data).toMatchObject({ type: 'task', title: 'Buy: "wood glue"', size: 'medium', done: false, tags: ['BUY'] });

    const patched = await body(app.request(`/api/tasks/${task.id}`, json('PATCH', { done: true })));
    expect(patched.task.done).toBe(true);
    expect(typeof patched.task.doneAt).toBe('string');
    expect(matter(await readFile(task.filePath, 'utf8')).content).toContain('# Buy: "wood glue"');

    expect((await app.request(`/api/tasks/${task.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/api/tasks/${task.id}`)).status).toBe(404);
  });

  test('rejects a task without a title', async () => {
    expect((await app.request('/api/tasks', json('POST', { size: 'big' }))).status).toBe(400);
  });
});

describe('calendar', () => {
  test('filters events by date range (placeholders rendered relative to today)', async () => {
    const today = localYmd(new Date());
    const tomorrow = localYmd(addDays(new Date(), 1));
    const r = await app.request(`/api/calendar?from=${today}T00:00:00&to=${tomorrow}T00:00:00`);
    const titles = (await body(r)).events.map((e: any) => e.title);
    expect(titles).toEqual(['Deep work: huburton/os README', 'Garden club meetup']);
  });

  test('normalises datetime-local input (no seconds) before storing', async () => {
    const r = await app.request('/api/calendar', json('POST', { title: 'Late call', start: '2030-01-31T23:30', end: '2030-01-31T23:45' }));
    const { event } = await body(r);
    expect(event.start).toBe('2030-01-31T23:30:00');
    // filed under the month as written, not the UTC month
    expect(event.filePath).toContain(join('calendar', '2030-01'));
  });
});

describe('projects, ideas, media, brief', () => {
  test('project metadata keeps milestones from YAML', async () => {
    const { metas } = await body(app.request('/api/project-metas'));
    expect(metas[0].name).toBe('HUBURTON-OS');
    expect(metas[0].milestones).toHaveLength(4);
  });

  test('ideas come from the Obsidian Kanban note, new ones land in the first lane', async () => {
    const before = (await body(app.request('/api/ideas'))).ideas;
    expect(before.filter((i: any) => i.statut === 'brute')).toHaveLength(3);
    expect(before.find((i: any) => i.title.startsWith('Small 3D-printed'))).toMatchObject({ statut: 'exploration', domaine: '3d' });

    expect((await app.request('/api/ideas', json('POST', { title: 'Test idea' }))).status).toBe(200);
    const after = (await body(app.request('/api/ideas'))).ideas;
    expect(after.filter((i: any) => i.statut === 'brute').map((i: any) => i.title)).toContain('Test idea');
  });

  test('media library reads the per-category folders', async () => {
    const { media } = await body(app.request('/api/media'));
    expect(media).toHaveLength(6);
    expect(media.find((m: any) => m.id === 'rivers-of-salt')).toMatchObject({ categorie: 'livre', statut: 'vu', note: 7 });
  });

  test("today's brief is parsed into sections", async () => {
    const b = await body(app.request('/api/brief'));
    expect(b.date).toBe(localYmd(new Date()));
    expect(b.blocks.map((x: any) => x.section)).toEqual(['OVERNIGHT', 'PRIORITÉ J', 'CONTEXTE LATÉRAL']);
  });
});

describe('activity stream', () => {
  test('events posted by other tools show up in the feed', async () => {
    const r = await app.request('/api/events', json('POST', { source: 'ci', kind: 'deploy', title: 'build ok', level: 'ok' }));
    expect(r.status).toBe(201);
    const { events } = await body(app.request('/api/events?limit=5'));
    expect(events[0]).toMatchObject({ source: 'ci', title: 'build ok', level: 'ok' });
  });
});
