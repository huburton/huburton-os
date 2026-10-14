// Posters and metadata: TMDB (films, series; needs a key), Google Books and Wikipedia (keyless).
// With OFFLINE=1 every lookup short-circuits to "nothing found".
import { OFFLINE } from './config.ts';

const fetch = (input: string, init?: RequestInit): Promise<Response> =>
  OFFLINE ? Promise.reject(new Error('offline')) : globalThis.fetch(input, init);

const TMDB_KEY = process.env.TMDB_API_KEY || '';
const TMDB_READ_TOKEN = process.env.TMDB_READ_TOKEN || '';

interface PosterResult { url?: string; source: 'tmdb' | 'wikipedia' | 'none'; }

// === RECHERCHE MULTI-RÉSULTATS ===
export interface SearchHit {
  source: 'tmdb' | 'google_books';
  kind: 'movie' | 'tv' | 'book';
  title: string;
  year?: number;
  poster?: string;
  backdrop?: string;
  overview?: string;
  externalId: string;
  authors?: string[];
  voteAverage?: number;
}

function tmdbHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json' };
  if (TMDB_READ_TOKEN) h['Authorization'] = `Bearer ${TMDB_READ_TOKEN}`;
  return h;
}
function tmdbUrl(path: string, params: Record<string, string> = {}): string {
  const u = new URL(`https://api.themoviedb.org/3${path}`);
  u.searchParams.set('language', 'fr-FR');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!TMDB_READ_TOKEN && TMDB_KEY) u.searchParams.set('api_key', TMDB_KEY);
  return u.toString();
}

export async function searchTmdb(query: string, kind: 'movie' | 'tv'): Promise<SearchHit[]> {
  if (!TMDB_KEY && !TMDB_READ_TOKEN) return [];
  try {
    const r = await fetch(tmdbUrl(`/search/${kind}`, { query, page: '1' }), { headers: tmdbHeaders() });
    if (!r.ok) return [];
    const data = await r.json() as any;
    return (data.results || []).slice(0, 12).map((it: any) => ({
      source: 'tmdb' as const,
      kind,
      title: kind === 'movie' ? it.title : it.name,
      year: parseInt(((kind === 'movie' ? it.release_date : it.first_air_date) || '').slice(0, 4)) || undefined,
      poster: it.poster_path ? `https://image.tmdb.org/t/p/w500${it.poster_path}` : undefined,
      backdrop: it.backdrop_path ? `https://image.tmdb.org/t/p/original${it.backdrop_path}` : undefined,
      overview: it.overview || undefined,
      externalId: String(it.id),
      voteAverage: typeof it.vote_average === 'number' ? it.vote_average : undefined,
    }));
  } catch { return []; }
}

// Details TMDB : trailer YouTube + détails (runtime, genres, imdb_id, backdrop). Coût : 1 appel.
export interface WatchProvider {
  name: string;
  logo?: string;
  type: 'flatrate' | 'rent' | 'buy' | 'free' | 'ads';
}

export async function tmdbDetails(kind: 'movie' | 'tv', id: string, region = 'FR'): Promise<{
  trailerKey?: string; backdrop?: string; imdbId?: string; runtime?: number; genres: string[];
  overview?: string; providers: WatchProvider[];
} | null> {
  if (!TMDB_KEY && !TMDB_READ_TOKEN) return null;
  try {
    const r = await fetch(tmdbUrl(`/${kind}/${id}`, { append_to_response: 'videos,external_ids,watch/providers' }), { headers: tmdbHeaders() });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const videos = d.videos?.results || [];
    const trailer = videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
      || videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer')
      || videos.find((v: any) => v.site === 'YouTube');

    // Watch providers : TMDB groupe par pays. On prend FR par défaut, fallback BE puis US.
    const providers: WatchProvider[] = [];
    const wp = d['watch/providers']?.results || {};
    const regions = [region, 'BE', 'US'];
    for (const reg of regions) {
      const rp = wp[reg];
      if (!rp) continue;
      for (const type of ['flatrate', 'free', 'ads', 'rent', 'buy'] as const) {
        for (const p of rp[type] || []) {
          if (providers.find(x => x.name === p.provider_name)) continue;
          providers.push({
            name: p.provider_name,
            logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : undefined,
            type,
          });
        }
      }
      if (providers.length) break; // on a trouvé pour cette région, stop
    }

    return {
      trailerKey: trailer?.key,
      backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : undefined,
      imdbId: d.external_ids?.imdb_id || d.imdb_id,
      runtime: d.runtime || (Array.isArray(d.episode_run_time) ? d.episode_run_time[0] : undefined),
      genres: Array.isArray(d.genres) ? d.genres.map((g: any) => g.name) : [],
      overview: d.overview,
      providers,
    };
  } catch { return null; }
}

export async function searchBook(query: string): Promise<SearchHit[]> {
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12&langRestrict=fr`);
    if (!r.ok) return [];
    const data = await r.json() as any;
    return (data.items || []).map((it: any) => {
      const v = it.volumeInfo || {};
      return {
        source: 'google_books' as const,
        kind: 'book' as const,
        title: v.title || '?',
        year: parseInt((v.publishedDate || '').slice(0, 4)) || undefined,
        poster: v.imageLinks?.thumbnail?.replace('http://', 'https://') || undefined,
        overview: v.description || undefined,
        externalId: it.id,
        authors: v.authors || [],
      };
    });
  } catch { return []; }
}

export async function searchAny(query: string, kind: 'movie' | 'tv' | 'book'): Promise<SearchHit[]> {
  if (kind === 'book') return searchBook(query);
  return searchTmdb(query, kind);
}

async function tmdbPoster(title: string, kind: 'movie' | 'tv', year?: number): Promise<string | null> {
  if (!TMDB_KEY && !TMDB_READ_TOKEN) return null;
  try {
    const params: Record<string, string> = { query: title };
    if (year) params[kind === 'movie' ? 'year' : 'first_air_date_year'] = String(year);
    const search = await fetch(tmdbUrl(`/search/${kind}`, params), { headers: tmdbHeaders() });
    if (!search.ok) return null;
    const data = await search.json() as any;
    const first = data.results?.[0];
    if (!first?.poster_path) return null;
    return `https://image.tmdb.org/t/p/w500${first.poster_path}`;
  } catch { return null; }
}

// Enrichissement d'une fiche : genres FR, saga (collection TMDB, films seulement), durée, note TMDB, imdb. Coût : 1 appel.
export interface TmdbEnrichment {
  genres: string[]; saga?: string; saga_id?: number; duree?: number;
  tmdb_note?: number; imdb_id?: string; backdrop?: string;
}
export async function tmdbEnrich(kind: 'movie' | 'tv', id: string): Promise<TmdbEnrichment | null> {
  if (!TMDB_KEY && !TMDB_READ_TOKEN) return null;
  try {
    const r = await fetch(tmdbUrl(`/${kind}/${id}`, { append_to_response: 'external_ids' }), { headers: tmdbHeaders() });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const col = d.belongs_to_collection;
    return {
      genres: Array.isArray(d.genres) ? d.genres.map((g: any) => g.name) : [],
      saga: col?.name?.replace(/ - Saga$/i, '').replace(/^Saga /i, '') || undefined,
      saga_id: col?.id,
      duree: d.runtime || (Array.isArray(d.episode_run_time) ? d.episode_run_time[0] : undefined) || undefined,
      tmdb_note: typeof d.vote_average === 'number' && d.vote_count > 20 ? Math.round(d.vote_average * 10) / 10 : undefined,
      imdb_id: d.external_ids?.imdb_id || d.imdb_id || undefined,
      backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : undefined,
    };
  } catch { return null; }
}

// Tous les films d'une saga TMDB, dans l'ordre de sortie.
export interface SagaPart { externalId: string; title: string; year?: number; poster?: string; backdrop?: string; overview?: string; released: boolean; }
export async function tmdbCollection(id: string): Promise<{ name: string; parts: SagaPart[] } | null> {
  if (!TMDB_KEY && !TMDB_READ_TOKEN) return null;
  try {
    const r = await fetch(tmdbUrl(`/collection/${id}`), { headers: tmdbHeaders() });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const today = new Date().toISOString().slice(0, 10);
    const parts: SagaPart[] = (d.parts || [])
      .map((p: any) => ({
        externalId: String(p.id), title: p.title,
        year: parseInt((p.release_date || '').slice(0, 4)) || undefined,
        poster: p.poster_path ? `https://image.tmdb.org/t/p/w500${p.poster_path}` : undefined,
        backdrop: p.backdrop_path ? `https://image.tmdb.org/t/p/original${p.backdrop_path}` : undefined,
        overview: p.overview || undefined,
        released: !!p.release_date && p.release_date <= today,
        date: p.release_date || '9999',
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map(({ date, ...p }: any) => p);
    return { name: (d.name || '').replace(/ - Saga$/i, '').replace(/^Saga /i, ''), parts };
  } catch { return null; }
}

async function wikipediaPoster(title: string, lang = 'fr'): Promise<string | null> {
  try {
    const variants = [title, `${title} (film)`, `${title} (série télévisée)`, `${title} (jeu vidéo)`, `${title} (livre)`];
    for (const v of variants) {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(v)}`, {
        headers: { 'User-Agent': process.env.HTTP_USER_AGENT || 'huburton-os/0.8 (personal dashboard)' },
      });
      if (!r.ok) continue;
      const data = await r.json() as any;
      const img = data.originalimage?.source || data.thumbnail?.source;
      if (img) return img;
    }
  } catch { /* ignore */ }
  return null;
}

export async function findPoster(title: string, categorie: string, year?: number): Promise<PosterResult> {
  if (OFFLINE) return { source: 'none' };
  const isFilm = categorie === 'film';
  const isTV = categorie === 'série';
  if (isFilm || isTV) {
    const t = await tmdbPoster(title, isFilm ? 'movie' : 'tv', year);
    if (t) return { url: t, source: 'tmdb' };
  }
  const w = await wikipediaPoster(title, 'fr');
  if (w) return { url: w, source: 'wikipedia' };
  const en = await wikipediaPoster(title, 'en');
  if (en) return { url: en, source: 'wikipedia' };
  return { source: 'none' };
}
