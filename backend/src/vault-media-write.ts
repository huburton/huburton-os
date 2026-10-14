import { mkdir, readdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { findPoster, tmdbEnrich } from './posters.ts';
import { loadMedia } from './vault-media.ts';
import { VAULT_ROOT } from './config.ts';
import { walkMd, skipIndexNotes, slug, toFrontmatter } from './vault-fs.ts';

const MEDIA_DIR = join(VAULT_ROOT, '40-connaissances', 'médias');

const VALID_CAT = ['film','série','livre','jeu','podcast','musique','autre'] as const;
type Cat = typeof VALID_CAT[number];

export interface MediaInput {
  categorie: Cat | string;
  titre: string;
  auteur?: string;
  annee?: number;
  genre?: string[];
  note?: number;
  statut?: 'à-voir' | 'en-cours' | 'vu' | 'abandonné';
  plateforme?: string;
  recommande_par?: string;
  image_url?: string;
  backdrop_url?: string;
  external_id?: string;
  external_source?: string;
  imdb_id?: string;
  overview?: string;
  description?: string;
  date_fin?: string;
  saga?: string;
  saga_id?: number;
  duree?: number;
  tmdb_note?: number;
  plus_tard?: boolean;
  enrichi?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

// Champs TMDB ajoutés à une fiche film/série : on ne remplace jamais ce qui est déjà renseigné à la main.
async function enrichment(categorie: string, externalId: string, current: Record<string, any>): Promise<Record<string, unknown> | null> {
  const e = await tmdbEnrich(categorie === 'film' ? 'movie' : 'tv', externalId);
  if (!e) return null;
  const add: Record<string, unknown> = { enrichi: today() };
  if (!current.genre?.length && e.genres.length) add.genre = e.genres;
  if (!current.saga && e.saga) { add.saga = e.saga; add.saga_id = e.saga_id; }
  if (!current.duree && e.duree) add.duree = e.duree;
  if (e.tmdb_note !== undefined) add.tmdb_note = e.tmdb_note;
  if (!current.imdb_id && e.imdb_id) add.imdb_id = e.imdb_id;
  if (!current.backdrop_url && e.backdrop) add.backdrop_url = e.backdrop;
  return add;
}

export async function createMedia(input: MediaInput) {
  // déjà dans le vault (même fiche TMDB / Google Books) : on ne crée pas de doublon
  if (input.external_id) {
    const dup = (await loadMedia()).find(m => m.external_id === String(input.external_id) && m.external_source === input.external_source);
    if (dup) return { ...input, id: dup.id, filePath: dup.filePath, categorie: dup.categorie, exists: true };
  }
  if (!input.image_url) {
    const p = await findPoster(input.titre, String(input.categorie), input.annee);
    if (p.url) input.image_url = p.url;
  }
  const categorie = (VALID_CAT as readonly string[]).includes(input.categorie) ? input.categorie : 'autre';
  const dir = join(MEDIA_DIR, categorie);
  await mkdir(dir, { recursive: true });
  // homonymes (remakes…) : suffixe année puis compteur, jamais d'écrasement
  let id = slug(input.titre);
  const taken = async (x: string) => { try { await stat(join(dir, `${x}.md`)); return true; } catch { return false; } };
  if (await taken(id)) {
    const base = input.annee ? `${id}-${input.annee}` : id;
    id = base;
    for (let n = 2; await taken(id); n++) id = `${base}-${n}`;
  }
  const filePath = join(dir, `${id}.md`);
  const extra = input.external_source === 'tmdb' && input.external_id && (categorie === 'film' || categorie === 'série')
    ? await enrichment(categorie, String(input.external_id), input) : null;
  const fm: Record<string, unknown> = {
    type: 'media',
    categorie,
    titre: input.titre,
    auteur: input.auteur,
    annee: input.annee,
    genre: input.genre,
    plateforme: input.plateforme,
    statut: input.statut || 'à-voir',
    note: input.note,
    date_fin: input.statut === 'vu' ? today() : undefined,
    recommande_par: input.recommande_par,
    image_url: input.image_url,
    backdrop_url: input.backdrop_url,
    external_id: input.external_id,
    external_source: input.external_source,
    imdb_id: input.imdb_id,
    overview: input.overview,
    added_at: new Date().toISOString(),
    ...extra,
  };
  const body = `# ${input.titre}\n${input.image_url ? `\n![${input.titre}](${input.image_url})\n` : ''}\n${input.overview || input.description || ''}\n`;
  await writeFile(filePath, `${toFrontmatter(fm, { dropEmpty: true })}\n${body}`, 'utf8');
  return { ...input, id, filePath, categorie };
}

export async function deleteMedia(id: string): Promise<boolean> {
  try { await stat(MEDIA_DIR); } catch { return false; }
  for await (const file of walkMd(MEDIA_DIR, skipIndexNotes)) {
    if (file.endsWith(`/${id}.md`) || file.includes(`/${id}.md`)) {
      await rm(file, { force: true });
      return true;
    }
  }
  return false;
}

// null efface la clé (ex. retirer une note) ; passer en « vu » date la fiche si elle ne l'était pas
async function patchFile(file: string, patch: Record<string, unknown>) {
  const raw = await readFile(file, 'utf8');
  const { data, content } = matter(raw);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete (data as any)[k];
    else if (v !== undefined) (data as any)[k] = v;
  }
  if (patch.statut === 'vu' && !data.date_fin) data.date_fin = today();
  if (typeof patch.note === 'number') delete (data as any).plus_tard;
  await writeFile(file, `${toFrontmatter(data, { dropEmpty: true })}\n${content}`, 'utf8');
}

export async function updateMedia(id: string, patch: Record<string, unknown>): Promise<boolean> {
  try { await stat(MEDIA_DIR); } catch { return false; }
  for await (const file of walkMd(MEDIA_DIR, skipIndexNotes)) {
    if (!file.endsWith(`/${id}.md`)) continue;
    await patchFile(file, patch);
    return true;
  }
  return false;
}

// Enrichissement TMDB de toutes les fiches film/série pas encore enrichies (en tâche de fond, ~4 appels/s).
export const enrichStatus = { running: false, total: 0, done: 0, updated: 0, errors: 0 };
export async function enrichAll(force = false) {
  if (enrichStatus.running) return;
  const todo = (await loadMedia()).filter(m => m.external_source === 'tmdb' && m.external_id
    && (m.categorie === 'film' || m.categorie === 'série') && (force || !m.enrichi));
  Object.assign(enrichStatus, { running: true, total: todo.length, done: 0, updated: 0, errors: 0 });
  try {
    for (const m of todo) {
      const add = await enrichment(m.categorie, m.external_id!, m);
      if (add) { await patchFile(m.filePath, add); enrichStatus.updated++; } else enrichStatus.errors++;
      enrichStatus.done++;
      await new Promise(r => setTimeout(r, 250));
    }
  } finally { enrichStatus.running = false; }
}
