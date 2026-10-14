import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { VAULT_ROOT } from './config.ts';
import { walkMd, skipIndexNotes } from './vault-fs.ts';

const MEDIA_DIR = join(VAULT_ROOT, '40-connaissances', 'médias');
const IDEAS_DIR = join(VAULT_ROOT, '40-connaissances', 'idées');

export interface VaultMedia {
  id: string;
  title: string;
  categorie: string;
  auteur?: string;
  annee?: number;
  genre?: string[];
  note?: number;
  statut?: string;
  plateforme?: string;
  image_url?: string;
  backdrop_url?: string;
  external_id?: string;
  external_source?: string;
  imdb_id?: string;
  overview?: string;
  added_at?: string;
  date_fin?: string;
  saga?: string;
  saga_id?: number;
  duree?: number;
  tmdb_note?: number;
  plus_tard?: boolean;
  enrichi?: string;
  filePath: string;
}

// gray-matter lit les dates YAML non quotées comme des Date
const day = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v : undefined;

export interface VaultIdea {
  id: string;
  title: string;
  domaine: string;
  statut: string;
  priorite?: number;
  effort?: string;
  budget?: number;
  dateCreation?: string;
  filePath: string;
}

export async function loadMedia(): Promise<VaultMedia[]> {
  const out: VaultMedia[] = [];
  try { await stat(MEDIA_DIR); } catch { return out; }
  for await (const file of walkMd(MEDIA_DIR, skipIndexNotes)) {
    const raw = await readFile(file, 'utf8');
    const { data } = matter(raw);
    if (data.type !== 'media') continue;
    out.push({
      id: file.split('/').pop()!.replace(/\.md$/, ''),
      title: (data.titre as string) || (data.title as string) || '',
      categorie: (data.categorie as string) || 'autre',
      auteur: data.auteur as string,
      annee: data.annee as number,
      genre: Array.isArray(data.genre) ? data.genre : data.genre ? [data.genre as string] : undefined,
      note: typeof data.note === 'number' ? data.note : undefined,
      statut: data.statut as string,
      plateforme: data.plateforme as string,
      image_url: data.image_url as string,
      backdrop_url: data.backdrop_url as string,
      external_id: data.external_id as string,
      external_source: data.external_source as string,
      imdb_id: data.imdb_id as string,
      overview: data.overview as string,
      added_at: day(data.added_at),
      date_fin: day(data.date_fin),
      saga: data.saga as string,
      saga_id: typeof data.saga_id === 'number' ? data.saga_id : undefined,
      duree: typeof data.duree === 'number' ? data.duree : undefined,
      tmdb_note: typeof data.tmdb_note === 'number' ? data.tmdb_note : undefined,
      plus_tard: data.plus_tard === true || undefined,
      enrichi: day(data.enrichi),
      filePath: file,
    });
  }
  return out;
}

export async function loadIdeas(): Promise<VaultIdea[]> {
  const out: VaultIdea[] = [];
  try { await stat(IDEAS_DIR); } catch { return out; }
  for await (const file of walkMd(IDEAS_DIR, skipIndexNotes)) {
    const raw = await readFile(file, 'utf8');
    const { data } = matter(raw);
    if (data.type !== 'idée') continue;
    out.push({
      id: file.split('/').pop()!.replace(/\.md$/, ''),
      title: (data.titre as string) || '',
      domaine: (data.domaine as string) || 'autre',
      statut: (data.statut as string) || 'brute',
      priorite: data.priorite as number,
      effort: data.effort as string,
      budget: data.budget_estime as number,
      dateCreation: data.date_creation as string,
      filePath: file,
    });
  }
  return out;
}
