// Shared helpers for reading and writing vault notes (Markdown + YAML frontmatter).
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Recursively yields every .md file under `dir`. Missing directories yield nothing. */
export async function* walkMd(dir: string, skip: (name: string) => boolean = () => false): AsyncGenerator<string> {
  let entries: string[];
  try { entries = await readdir(dir); } catch { return; }
  for (const name of entries) {
    if (skip(name)) continue;
    const full = join(dir, name);
    let s; try { s = await stat(full); } catch { continue; }
    if (s.isDirectory()) yield* walkMd(full, skip);
    else if (name.endsWith('.md')) yield full;
  }
}

/** Index/kanban/dashboard notes that live next to the data but are not records. */
export const skipIndexNotes = (name: string) =>
  name.startsWith('kanban') || name === 'dashboard.md' || name.startsWith('INDEX');

/** ASCII file-name slug: "Café crème !" -> "cafe-creme". */
export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * Serialises a frontmatter block. Values are written as JSON scalars/arrays (valid YAML), so titles with
 * colons or quotes survive a round trip through gray-matter and Obsidian. undefined/null keys are dropped;
 * with `dropEmpty`, empty strings too.
 */
export function toFrontmatter(data: Record<string, unknown>, opts: { dropEmpty?: boolean } = {}): string {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && !(opts.dropEmpty && v === ''))
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map(x => JSON.stringify(x)).join(', ')}]`;
      if (v instanceof Date) return `${k}: ${JSON.stringify(v.toISOString().slice(0, 10))}`;
      if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
      if (typeof v === 'string') return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${v}`;
    });
  return `---\n${lines.join('\n')}\n---\n`;
}
