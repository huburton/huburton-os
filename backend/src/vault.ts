import { readdir, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { VAULT_ROOT } from './config.ts';
import { walkMd, slug, toFrontmatter } from './vault-fs.ts';

const TASKS_DIR = join(VAULT_ROOT, '20-tasks');

export type TaskSize = 'small' | 'medium' | 'big';

export interface VaultTask {
  id: string;
  title: string;
  size: TaskSize;
  tags: string[];
  done: boolean;
  overdue?: boolean;
  project?: string;
  filePath: string;
  createdAt?: string;
  doneAt?: string;
  order?: number;
  body?: string;
  links?: string[];
  images?: string[];
}

export interface VaultProject {
  name: string;
  subtitle?: string;
  status?: string;
  tag?: string;
  total: number;
  done: number;
}

function parseMd(file: string, raw: string) {
  const parsed = matter(raw);
  const data = parsed.data;
  if (data.type !== 'task') return { task: null as VaultTask | null, parsed };
  const id = (data.id as string) || basename(file, '.md');
  const body = parsed.content || '';
  const images = [...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
  const links = [...body.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)].map(m => m[2]);
  const rawUrls = [...body.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0]);
  return {
    task: {
      id,
      title: (data.title as string) || basename(file, '.md'),
      size: ((data.size as string) || 'small') as TaskSize,
      tags: Array.isArray(data.tags) ? data.tags.filter((t: any) => typeof t === 'string') : [],
      done: Boolean(data.done),
      overdue: Boolean(data.overdue),
      project: data.project as string | undefined,
      filePath: file,
      createdAt: data.created_at as string | undefined,
      doneAt: data.done_at as string | undefined,
      order: typeof data.order === 'number' ? data.order : undefined,
      body, images,
      links: [...new Set([...links, ...rawUrls])],
    } as VaultTask,
    parsed,
  };
}

export async function loadTasks(): Promise<VaultTask[]> {
  const tasks: VaultTask[] = [];
  try { await stat(TASKS_DIR); } catch { return tasks; }
  for await (const file of walkMd(TASKS_DIR)) {
    const raw = await readFile(file, 'utf8');
    const { task } = parseMd(file, raw);
    if (task) tasks.push({ ...task, body: undefined, images: undefined, links: undefined });
  }
  // tri par order (puis createdAt fallback)
  tasks.sort((a, b) => {
    const ao = a.order ?? Number.parseInt(a.createdAt ? Date.parse(a.createdAt).toString() : '0', 10);
    const bo = b.order ?? Number.parseInt(b.createdAt ? Date.parse(b.createdAt).toString() : '0', 10);
    return ao - bo;
  });
  return tasks;
}

export async function loadTask(id: string): Promise<VaultTask | null> {
  try { await stat(TASKS_DIR); } catch { return null; }
  for await (const file of walkMd(TASKS_DIR)) {
    if (!file.includes(id)) continue;
    const raw = await readFile(file, 'utf8');
    const { task } = parseMd(file, raw);
    if (task && task.id === id) return task;
  }
  return null;
}

export async function loadProjects(): Promise<VaultProject[]> {
  const tasks = await loadTasks();
  const byProject = new Map<string, VaultProject>();
  for (const t of tasks) {
    if (!t.project) continue;
    const p = byProject.get(t.project) || { name: t.project, total: 0, done: 0 };
    p.total++; if (t.done) p.done++;
    byProject.set(t.project, p);
  }
  return [...byProject.values()].sort((a, b) => b.total - a.total);
}

export async function createTask(input: {
  title: string; size?: TaskSize; tags?: string[]; project?: string; body?: string;
}): Promise<VaultTask> {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const ts = now.toISOString();
  const id = `${ymd}-${slug(input.title)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  const dir = join(TASKS_DIR, ymd);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${id}.md`);

  const fm: Record<string, unknown> = {
    type: 'task',
    id,
    title: input.title,
    size: input.size || 'small',
    tags: input.tags || [],
    done: false,
    project: input.project,
    order: now.getTime(),
    created_at: ts,
  };
  const body = input.body || `# ${input.title}\n`;
  await writeFile(filePath, `${toFrontmatter(fm)}\n${body}`, 'utf8');
  return {
    id, title: input.title, size: input.size || 'small', tags: input.tags || [],
    done: false, project: input.project, filePath, createdAt: ts, order: now.getTime(),
  };
}

export async function updateTask(id: string, patch: Partial<{
  done: boolean; size: TaskSize; tags: string[]; project: string | null;
  title: string; body: string; order: number;
}>): Promise<VaultTask | null> {
  const task = await loadTask(id);
  if (!task) return null;
  const raw = await readFile(task.filePath, 'utf8');
  const { data, content } = matter(raw);
  if (patch.done !== undefined) {
    data.done = patch.done;
    if (patch.done) data.done_at = new Date().toISOString();
    else delete data.done_at;
  }
  if (patch.size !== undefined) data.size = patch.size;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.project !== undefined) {
    if (patch.project === null) delete data.project;
    else data.project = patch.project;
  }
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.order !== undefined) data.order = patch.order;
  const newBody = patch.body !== undefined ? patch.body : content;
  await writeFile(task.filePath, `${toFrontmatter(data)}\n${newBody.replace(/^\n+/, '')}`, 'utf8');
  return loadTask(id);
}

export async function deleteTask(id: string): Promise<boolean> {
  const task = await loadTask(id);
  if (!task) return false;
  await rm(task.filePath, { force: true });
  return true;
}

// Reorder en lot — applique size + order pour chaque item
export async function reorderTasks(items: Array<{ id: string; order: number; size?: TaskSize }>): Promise<void> {
  await Promise.all(items.map(it => updateTask(it.id, { order: it.order, ...(it.size ? { size: it.size } : {}) })));
}
