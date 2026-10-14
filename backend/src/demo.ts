// Demo vault: a fictional vault shipped in `demo-vault/`, copied to VAULT_ROOT on start.
// Notes use date placeholders so the agenda, tasks and brief always look current:
//   {{day}} -> today (YYYY-MM-DD, local time), {{day+2}} / {{day-1}} -> relative days.
// Placeholders work in file contents and in file/folder names.
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addDays, localYmd } from './dates.ts';

export function renderDatePlaceholders(text: string, today = new Date()): string {
  return text.replace(/\{\{day(?:([+-])(\d+))?\}\}/g, (_, sign: string | undefined, n: string | undefined) =>
    localYmd(addDays(today, sign ? (sign === '-' ? -1 : 1) * Number(n) : 0)));
}

/** Copies `template` into `target`, rendering placeholders. Returns the number of files written (0 = kept existing). */
export async function prepareDemoVault(template: string, target: string, opts: { overwrite?: boolean; today?: Date } = {}): Promise<number> {
  const existing = await readdir(target).catch(() => [] as string[]);
  if (existing.length && !opts.overwrite) return 0;
  const today = opts.today || new Date();
  let written = 0;
  async function copyDir(src: string, dst: string) {
    await mkdir(dst, { recursive: true });
    for (const name of await readdir(src)) {
      if (src === template && name === 'README.md') continue; // describes the template, not vault data
      const from = join(src, name);
      const to = join(dst, renderDatePlaceholders(name, today));
      if ((await stat(from)).isDirectory()) await copyDir(from, to);
      else {
        const raw = await readFile(from);
        const isText = /\.(md|json|txt)$/.test(name);
        await writeFile(to, isText ? renderDatePlaceholders(raw.toString('utf8'), today) : raw);
        written++;
      }
    }
  }
  await copyDir(template, target);
  return written;
}
