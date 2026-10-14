// Idées : le kanban Obsidian `40-connaissances/idées/kanban-idées.md` est la source (colonnes = statuts).
// La page IDÉES le lit et y ajoute les nouvelles idées dans « Idées brutes » ; Obsidian les voit tout de suite.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VaultIdea } from './vault-media.ts';
import { VAULT_ROOT } from './config.ts';

const LANES: [RegExp, string][] = [
  [/brute/i, 'brute'], [/explorer/i, 'exploration'], [/d[ée]veloppement/i, 'prototype'],
  [/concr[ée]tis/i, 'concrétisé'], [/abandonn/i, 'abandonné'],
];

// Noms de fichiers du vault parfois en Unicode décomposé (« idées » écrit e + accent) : comparaison normalisée
async function findNfc(dir: string, name: string): Promise<string | null> {
  const hit = (await readdir(dir).catch(() => [] as string[])).find(f => f.normalize('NFC') === name.normalize('NFC'));
  return hit ? join(dir, hit) : null;
}

async function kanbanFile(): Promise<string | null> {
  const know = await findNfc(VAULT_ROOT, '40-connaissances');
  const ideas = know && await findNfc(know, 'idées');
  return ideas ? findNfc(ideas, 'kanban-idées.md') : null;
}

export async function loadKanbanIdeas(): Promise<VaultIdea[]> {
  const file = await kanbanFile();
  if (!file) return [];
  const out: VaultIdea[] = [];
  let statut = 'brute';
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const lane = line.match(/^##\s+(.*)$/);
    if (lane) { statut = LANES.find(([re]) => re.test(lane[1]))?.[1] || 'brute'; continue; }
    const card = line.match(/^- \[[ x]\] (.+)$/);
    if (!card) continue;
    const text = card[1];
    out.push({
      id: `kanban-${out.length + 1}`,
      title: text.replace(/\[\[[^\]]+\]\]/g, '').replace(/\s+/g, ' ').trim(),
      domaine: /impression-3d|\b3d\b/i.test(text) ? '3d' : /[ée]lectroni|\biot\b/i.test(text) ? 'electronique' : 'autre',
      statut, filePath: file,
    });
  }
  return out;
}

/** Ajoute une carte en fin de la première colonne (« Idées brutes »), au format du plugin Kanban */
export async function addKanbanIdea(title: string): Promise<void> {
  const file = await kanbanFile();
  if (!file) throw new Error('kanban des idées introuvable');
  const lines = (await readFile(file, 'utf8')).split('\n');
  const head = lines.findIndex(l => /^##\s/.test(l));
  if (head < 0) throw new Error('kanban sans colonne');
  let end = head + 1;
  while (end < lines.length && !/^##\s/.test(lines[end]) && !lines[end].startsWith('%%')) end++;
  let at = end;
  while (at > head + 1 && lines[at - 1].trim() === '') at--;
  const card = `- [ ] ${title.replace(/\s+/g, ' ').trim()}`;
  lines.splice(at, 0, ...(at === head + 1 ? ['', card] : [card]));
  await writeFile(file, lines.join('\n'), 'utf8');
}
