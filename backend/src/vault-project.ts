import { readdir, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { VAULT_ROOT } from './config.ts';
import { walkMd, slug, toFrontmatter } from './vault-fs.ts';

const PROJECTS_DIR = join(VAULT_ROOT, '30-projects');

export interface ProjectMeta {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
  deadline?: string;
  status?: 'planning' | 'in-progress' | 'almost-done' | 'done' | 'paused' | 'abandoned';
  priority?: number; // 1=top, 5=bof
  budget?: number;
  color?: string;
  tag?: string;
  filePath: string;
  body?: string;
  milestones?: { title: string; done: boolean; date?: string }[];
}

export async function loadProjectMetas(): Promise<ProjectMeta[]> {
  const out: ProjectMeta[] = [];
  try { await stat(PROJECTS_DIR); } catch { return out; }
  for await (const file of walkMd(PROJECTS_DIR)) {
    const raw = await readFile(file, 'utf8');
    const { data, content } = matter(raw);
    if (data.type !== 'project') continue;
    out.push({
      id: (data.id as string) || basename(file, '.md'),
      name: (data.name as string) || basename(file, '.md').toUpperCase(),
      subtitle: data.subtitle as string,
      description: data.description as string,
      deadline: data.deadline as string,
      status: data.status as any,
      priority: data.priority as number,
      budget: data.budget as number,
      color: data.color as string,
      tag: data.tag as string,
      milestones: Array.isArray(data.milestones) ? data.milestones : undefined,
      filePath: file,
      body: content?.trim(),
    });
  }
  out.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  return out;
}

export async function createProjectMeta(input: Partial<ProjectMeta> & { name: string }): Promise<ProjectMeta> {
  await mkdir(PROJECTS_DIR, { recursive: true });
  const id = slug(input.name);
  const filePath = join(PROJECTS_DIR, `${id}.md`);
  const fm: Record<string, unknown> = {
    type: 'project',
    id,
    name: input.name,
    subtitle: input.subtitle,
    description: input.description,
    deadline: input.deadline,
    status: input.status || 'planning',
    priority: input.priority ?? 3,
    budget: input.budget,
    color: input.color,
    tag: input.tag,
    created_at: new Date().toISOString(),
  };
  await writeFile(filePath, `${toFrontmatter(fm)}\n${input.body || `# ${input.name}\n`}\n`, 'utf8');
  return { ...input, id, filePath } as ProjectMeta;
}

export async function updateProjectMeta(id: string, patch: Partial<ProjectMeta>): Promise<ProjectMeta | null> {
  try { await stat(PROJECTS_DIR); } catch { return null; }
  let target: string | null = null;
  for await (const file of walkMd(PROJECTS_DIR)) {
    if (file.includes(id)) { target = file; break; }
  }
  if (!target) return null;
  const raw = await readFile(target, 'utf8');
  const { data, content } = matter(raw);
  for (const k of Object.keys(patch) as (keyof ProjectMeta)[]) {
    if (patch[k] === undefined) continue;
    if (patch[k] === null) delete (data as any)[k];
    else (data as any)[k] = patch[k];
  }
  await writeFile(target, `${toFrontmatter(data)}\n${patch.body !== undefined ? patch.body : content}\n`, 'utf8');
  return (await loadProjectMetas()).find(p => p.id === id) || null;
}

export async function deleteProjectMeta(id: string): Promise<boolean> {
  try { await stat(PROJECTS_DIR); } catch { return false; }
  for await (const file of walkMd(PROJECTS_DIR)) {
    if (file.includes(id)) {
      await rm(file, { force: true });
      return true;
    }
  }
  return false;
}
