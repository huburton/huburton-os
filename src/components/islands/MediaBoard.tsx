import { useEffect, useMemo, useRef, useState } from 'react';
import { Collection, QuickRate } from './MediaCollection.tsx';
import { Sagas } from './MediaSagas.tsx';

interface Media {
  id: string; title: string; categorie: string;
  auteur?: string; annee?: number; genre?: string[];
  note?: number; statut?: string; plateforme?: string;
  image_url?: string; backdrop_url?: string;
  external_id?: string; external_source?: string;
  imdb_id?: string; overview?: string; added_at?: string;
  date_fin?: string; saga?: string; saga_id?: number; duree?: number; tmdb_note?: number; plus_tard?: boolean; enrichi?: string;
}

interface SearchHit {
  source: string; kind: 'movie' | 'tv' | 'book';
  title: string; year?: number; poster?: string; backdrop?: string;
  overview?: string; externalId: string; voteAverage?: number; authors?: string[];
}

interface TmdbDetails {
  trailerKey?: string; backdrop?: string; imdbId?: string;
  runtime?: number; genres: string[]; overview?: string;
  providers?: Array<{ name: string; logo?: string; type: 'flatrate' | 'rent' | 'buy' | 'free' | 'ads' }>;
}

const CAT_LABEL: Record<string, string> = {
  film: 'Films', série: 'Séries', livre: 'Livres', jeu: 'Jeux', podcast: 'Podcasts', musique: 'Musique', autre: 'Autres',
};
const STAT_COLOR: Record<string, string> = {
  'à-voir': 'bg-[var(--color-acc-yellow)] text-[var(--color-fg)]',
  'en-cours': 'bg-[var(--color-acc-orange)] text-[var(--color-bg)]',
  'vu': 'bg-[var(--color-acc-green)] text-[var(--color-bg)]',
  'abandonné': 'bg-[var(--color-fg-faint)] text-[var(--color-bg)]',
};

const SEARCH_TYPES: Array<{ key: 'movie' | 'tv' | 'book'; label: string; categorie: string }> = [
  { key: 'movie', label: 'FILM', categorie: 'film' },
  { key: 'tv', label: 'SÉRIE', categorie: 'série' },
  { key: 'book', label: 'LIVRE', categorie: 'livre' },
];

// Mapping fournisseur TMDB -> deep-link de recherche par titre. Stremio est toujours montré, les autres uniquement si TMDB les liste pour FR.
const PROVIDER_META: Record<string, { label: string; color: string; emoji?: string; url: (title: string) => string }> = {
  'Netflix':            { label: 'NETFLIX',   color: '#E50914', emoji: 'N',  url: t => `https://www.netflix.com/search?q=${encodeURIComponent(t)}` },
  'Amazon Prime Video': { label: 'PRIME',     color: '#00A8E1', emoji: 'P',  url: t => `https://www.primevideo.com/region/eu/search/ref=atv_nb_sr?phrase=${encodeURIComponent(t)}` },
  'Disney Plus':        { label: 'DISNEY+',   color: '#0F6FBF', emoji: 'D+', url: t => `https://www.disneyplus.com/fr-fr/search?q=${encodeURIComponent(t)}` },
  'Apple TV Plus':      { label: 'APPLE TV+', color: '#000000', emoji: '',   url: t => `https://tv.apple.com/fr/search?term=${encodeURIComponent(t)}` },
  'Apple TV':           { label: 'APPLE TV',  color: '#000000', emoji: '',   url: t => `https://tv.apple.com/fr/search?term=${encodeURIComponent(t)}` },
  'Max':                { label: 'MAX (HBO)', color: '#002BE7', emoji: 'M',  url: t => `https://play.max.com/search?q=${encodeURIComponent(t)}` },
  'Canal+':             { label: 'CANAL+',    color: '#000000', emoji: 'C+', url: t => `https://www.canalplus.com/recherche/?q=${encodeURIComponent(t)}` },
  'OCS':                { label: 'OCS',       color: '#FF6F00', emoji: 'O',  url: t => `https://www.ocs.fr/recherche?q=${encodeURIComponent(t)}` },
  'Paramount Plus':     { label: 'PARAMOUNT+',color: '#0064FF', emoji: 'P+', url: t => `https://www.paramountplus.com/fr/search/${encodeURIComponent(t)}` },
  'Crunchyroll':        { label: 'CRUNCHYROLL', color: '#F47521', emoji: 'C', url: t => `https://www.crunchyroll.com/fr/search?q=${encodeURIComponent(t)}` },
  'YouTube':            { label: 'YOUTUBE',   color: '#FF0000', emoji: 'Y',  url: t => `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}` },
};

function platformLinks(m: { title: string; imdb_id?: string; external_id?: string; external_source?: string; categorie: string }, providers?: TmdbDetails['providers']) {
  const q = encodeURIComponent(m.title);
  const links: Array<{ key: string; label: string; href: string; color: string; emoji?: string }> = [];
  if (m.categorie === 'film' || m.categorie === 'série') {
    // Stremio : TOUJOURS présent, deep-link IMDB si dispo
    const stremio = m.imdb_id
      ? `stremio:///detail/${m.categorie === 'film' ? 'movie' : 'series'}/${m.imdb_id}`
      : `stremio:///search?search=${q}`;
    links.push({ key: 'stremio', label: 'STREMIO', href: stremio, color: '#7B5BF5', emoji: '▶' });
    // Providers TMDB filtrés (uniquement ceux dispos pour FR)
    const seen = new Set<string>();
    for (const p of providers || []) {
      const meta = PROVIDER_META[p.name];
      if (!meta || seen.has(meta.label)) continue;
      seen.add(meta.label);
      links.push({ key: meta.label.toLowerCase(), label: meta.label, href: meta.url(m.title), color: meta.color, emoji: meta.emoji });
    }
    if (m.imdb_id) links.push({ key: 'imdb', label: 'IMDB', href: `https://www.imdb.com/title/${m.imdb_id}/`, color: '#F5C518', emoji: 'i' });
  }
  if (m.categorie === 'livre') {
    if (m.external_id) links.push({ key: 'gbooks', label: 'GOOGLE BOOKS', href: `https://books.google.com/books?id=${m.external_id}`, color: '#4285F4', emoji: 'G' });
    links.push({ key: 'amazon', label: 'AMAZON', href: `https://www.amazon.fr/s?k=${q}&i=stripbooks`, color: '#FF9900', emoji: 'A' });
  }
  return links;
}

function ScoreBadge({ n }: { n?: number }) {
  if (n === undefined) return null;
  const color = n >= 8 ? 'var(--color-acc-green)' : n >= 6 ? 'var(--color-acc-yellow)' : 'var(--color-acc-red)';
  return (
    <span className="font-mono text-[10px] tabular-nums px-[5px] py-[1px] font-bold" style={{ background: color, color: 'var(--color-bg)' }}>
      {n}/10
    </span>
  );
}

function Card({ m, onClick }: { m: Media; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative shrink-0 w-[180px] md:w-[200px] aspect-[2/3] overflow-hidden brutal-border-soft bg-[var(--color-bg-soft)] transition-all duration-300 hover:scale-[1.04] hover:z-10 hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)]"
    >
      {m.image_url ? (
        <img src={m.image_url} alt={m.title} loading="lazy" className="w-full h-full object-cover transition-all duration-300 group-hover:brightness-110" />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-sans font-semibold text-[15px] text-center p-3 leading-tight">{m.title}</div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
        <p className="font-sans text-white text-[12px] leading-tight font-bold line-clamp-2">{m.title}</p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {m.annee && <span className="font-mono text-[9px] uppercase tracking-wider text-white/80">{m.annee}</span>}
          {m.statut && <span className={`font-mono text-[8px] uppercase tracking-wider px-[4px] py-[1px] ${STAT_COLOR[m.statut] || 'bg-white text-black'}`}>{m.statut}</span>}
          {m.note !== undefined && <ScoreBadge n={m.note} />}
        </div>
      </div>
    </button>
  );
}

function Row({ title, items, onPick }: { title: string; items: Media[]; onPick: (m: Media) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  function scroll(dir: number) {
    scrollRef.current?.scrollBy({ left: dir * 600, behavior: 'smooth' });
  }
  if (items.length === 0) return null;
  return (
    <section className="mb-6 group/row">
      <div className="flex items-end justify-between px-8 mb-2">
        <h2 className="font-display text-[22px] tracking-[-0.01em]">{title} <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] ml-2">{items.length}</span></h2>
        <div className="flex gap-1 opacity-0 group-hover/row:opacity-100 transition">
          <button onClick={() => scroll(-1)} className="px-2 py-1 brutal-border-soft hover-paper font-mono text-[12px]">‹</button>
          <button onClick={() => scroll(1)} className="px-2 py-1 brutal-border-soft hover-paper font-mono text-[12px]">›</button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-3 px-8 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 -mb-4 hide-scrollbar">
        {items.map(m => <div key={m.id} className="snap-start"><Card m={m} onClick={() => onPick(m)} /></div>)}
      </div>
    </section>
  );
}

function Hero({ items, onPick, onTrailer, onAdd, count, loading }: { items: Media[]; onPick: (m: Media) => void; onTrailer: (m: Media) => void; onAdd: () => void; count: number; loading: boolean }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (items.length < 2 || paused) return;
    const i = setInterval(() => setIdx(x => (x + 1) % items.length), 8000);
    return () => clearInterval(i);
  }, [items.length, paused]);
  if (items.length === 0) return null;
  const cur = items[idx];
  return (
    <section
      className="relative h-[62vh] min-h-[420px] max-h-[640px] w-full overflow-hidden brutal-border-bottom"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {items.map((m, i) => {
        const src = m.backdrop_url || m.image_url;
        if (!src) return null;
        return (
          <img
            key={m.id} src={src} alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-[1400ms] ease-out ${i === idx ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
            loading={i === idx ? 'eager' : 'lazy'}
          />
        );
      })}
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg)] via-[var(--color-bg)]/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-[var(--color-bg)] to-transparent" />

      {/* Bouton + ADD ancré dans le hero, top-right, en dessous de la navbar */}
      <div className="absolute top-4 right-6 z-10 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/80 bg-black/40 px-2 py-[3px] backdrop-blur-sm">{loading ? 'LOADING…' : `${count} ENTRIES`}</span>
        <button onClick={onAdd} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider btn-primary shadow-[0_2px_8px_rgba(0,0,0,0.4)]">+ ADD</button>
      </div>

      <div className="absolute inset-0 flex items-end pb-12">
        <div key={cur.id} className="max-w-[700px] px-8 anim-fade-in">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--color-fg-muted)] mb-2">
            {cur.statut && <span className={`px-[5px] py-[1px] font-bold ${STAT_COLOR[cur.statut] || ''}`}>{cur.statut}</span>}
            <span className="ml-3">{CAT_LABEL[cur.categorie] || cur.categorie}{cur.annee ? ` · ${cur.annee}` : ''}</span>
          </p>
          <h1 className="font-display text-[clamp(48px,7vw,96px)] leading-[0.95] tracking-[-0.025em] drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">{cur.title}</h1>
          {cur.overview && <p className="font-sans text-[14px] mt-3 text-[var(--color-fg-muted)] leading-[1.55] line-clamp-3 max-w-[560px]">{cur.overview}</p>}
          <div className="flex flex-wrap gap-2 mt-5">
            <button onClick={() => onTrailer(cur)} className="px-4 py-2 bg-[var(--color-fg)] text-[var(--color-bg)] font-mono text-[11px] uppercase tracking-wider font-bold hover:bg-[var(--color-acc-red)] transition">
              ▶ TRAILER
            </button>
            <button onClick={() => onPick(cur)} className="px-4 py-2 brutal-border-soft hover-paper font-mono text-[11px] uppercase tracking-wider">
              + DÉTAILS
            </button>
          </div>
        </div>
      </div>
      {items.length > 1 && (
        <div className="absolute bottom-3 right-8 flex gap-1">
          {items.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`slide ${i+1}`} className={`h-[3px] transition-all ${i === idx ? 'w-8 bg-[var(--color-fg)]' : 'w-3 bg-[var(--color-fg-faint)]'}`} />
          ))}
        </div>
      )}
    </section>
  );
}

function TrailerModal({ media, onClose }: { media: Media | null; onClose: () => void }) {
  const [details, setDetails] = useState<TmdbDetails | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!media) { setDetails(null); return; }
    if (!media.external_id || (media.categorie !== 'film' && media.categorie !== 'série')) return;
    setLoading(true);
    const kind = media.categorie === 'film' ? 'movie' : 'tv';
    fetch(`/api/media/details?kind=${kind}&id=${media.external_id}`).then(r => r.json()).then(d => setDetails(d)).finally(() => setLoading(false));
  }, [media]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (media) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [media, onClose]);
  if (!media) return null;
  const trailerKey = details?.trailerKey;
  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="fixed inset-x-4 top-[8vh] bottom-[8vh] md:inset-x-[10vw] z-[101] brutal-border bg-black flex flex-col anim-fade-in">
        <header className="px-4 py-2 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between">
          <span className="font-section">▶ TRAILER · {media.title}</span>
          <button onClick={onClose} className="font-mono text-[14px] leading-none hover:text-[var(--color-acc-red)]">✕</button>
        </header>
        <div className="flex-1 flex items-center justify-center">
          {loading ? (
            <p className="font-mono text-[12px] uppercase tracking-wider text-white/70">Chargement…</p>
          ) : trailerKey ? (
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
              title={media.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="text-center p-8">
              <p className="font-sans font-semibold text-[20px] mb-3 text-white">Pas de trailer trouvé sur TMDB</p>
              <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(media.title + ' trailer')}`} target="_blank" rel="noopener" className="inline-block px-4 py-2 bg-[var(--color-acc-red)] text-white font-mono text-[11px] uppercase tracking-wider">
                CHERCHER SUR YOUTUBE →
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DetailModal({ media, all, onPick, onClose, onChanged }: { media: Media | null; all: Media[]; onPick: (m: Media) => void; onClose: () => void; onChanged: () => void }) {
  const [details, setDetails] = useState<TmdbDetails | null>(null);
  const [imdb, setImdb] = useState<string | undefined>(media?.imdb_id);
  const [showFullTrailer, setShowFullTrailer] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!media) { setDetails(null); setImdb(undefined); return; }
    setImdb(media.imdb_id);
    setShowFullTrailer(false);
    if (!media.external_id) return;
    if (media.categorie !== 'film' && media.categorie !== 'série') return;
    const kind = media.categorie === 'film' ? 'movie' : 'tv';
    fetch(`/api/media/details?kind=${kind}&id=${media.external_id}`).then(r => r.json()).then((d: TmdbDetails) => {
      setDetails(d);
      if (!media.imdb_id && d.imdbId) {
        setImdb(d.imdbId);
        // backfill silencieux : imdb_id + backdrop_url, sans toucher au reste
        fetch(`/api/media/${media.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imdb_id: d.imdbId, backdrop_url: media.backdrop_url || d.backdrop }),
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [media?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showFullTrailer) setShowFullTrailer(false);
        else onClose();
      }
    }
    if (media) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [media, onClose, showFullTrailer]);

  if (!media) return null;
  const mergedMedia = { ...media, imdb_id: imdb || media.imdb_id };
  const links = platformLinks(mergedMedia, details?.providers);
  const bg = media.backdrop_url || details?.backdrop || media.image_url;
  const trailerKey = details?.trailerKey;

  function flash(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 1400);
  }
  async function updateStatut(s: string) {
    await fetch(`/api/media/${media.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: s }) });
    flash(`Statut → ${s}`);
    onChanged();
  }
  async function updateNote(n: number | null) {
    await fetch(`/api/media/${media.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: n }) });
    flash(n === null ? 'Note effacée' : `Note → ${n}/10`);
    onChanged();
  }
  const updateDateFin = async (d: string) => {
    await fetch(`/api/media/${media.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date_fin: d || null }) });
    flash(d ? `Vu le ${d.split('-').reverse().join('/')}` : 'Date effacée');
    onChanged();
  };
  const saga = media.saga_id ? all.filter(m => m.saga_id === media.saga_id).sort((a, b) => (a.annee ?? 0) - (b.annee ?? 0)) : [];
  const genres = media.genre?.length ? media.genre : details?.genres || [];
  const runtime = media.duree || details?.runtime;
  async function remove() {
    if (!confirm(`Supprimer définitivement "${media.title}" du vault ?`)) return;
    await fetch(`/api/media/${media.id}`, { method: 'DELETE' });
    onChanged(); onClose();
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="fixed inset-x-2 top-[3vh] bottom-[3vh] md:inset-x-[5vw] z-[101] brutal-border bg-[var(--color-bg)] overflow-y-auto anim-pop">
        {/* Hero : backdrop fixe ; la bande-annonce ne se lance qu'au clic (plus d'autoplay « vidéo non disponible ») */}
        <div className="relative h-[48vh] min-h-[300px] w-full overflow-hidden bg-black">
          {bg && <img src={bg} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/30 to-[var(--color-bg)]/10 pointer-events-none" />

          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 brutal-border-soft bg-black/60 text-white hover:bg-[var(--color-acc-red)] font-mono text-[16px] flex items-center justify-center backdrop-blur-sm z-10">✕</button>

          {trailerKey && (
            <div className="absolute bottom-4 left-4 flex gap-2 z-10">
              <button onClick={() => setShowFullTrailer(true)} className="px-4 py-2 bg-[var(--color-fg)] text-[var(--color-bg)] font-mono text-[11px] uppercase tracking-wider font-bold hover:bg-[var(--color-acc-red)] transition flex items-center gap-2">
                <span>▶</span> TRAILER
              </button>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-[220px_1fr] gap-6 p-6">
          {media.image_url && (
            <img src={media.image_url} alt={media.title} className="w-[220px] aspect-[2/3] object-cover brutal-border-soft -mt-[140px] shadow-[0_8px_28px_-6px_rgba(0,0,0,0.6)] z-10 relative" />
          )}
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
              {CAT_LABEL[media.categorie] || media.categorie}{media.annee ? ` · ${media.annee}` : ''}{runtime ? ` · ${runtime} min` : ''}{media.tmdb_note ? ` · TMDB ${media.tmdb_note.toFixed(1).replace('.', ',')}` : ''}
            </p>
            <h1 className="font-display text-[clamp(36px,5vw,64px)] mt-1 leading-[0.95] tracking-[-0.025em]">{media.title}</h1>
            <div className="flex items-center flex-wrap gap-2 mt-3">
              {media.statut && <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-[3px] ${STAT_COLOR[media.statut] || ''}`}>{media.statut}</span>}
              {genres.slice(0, 4).map(g => (
                <span key={g} className="font-mono text-[10px] uppercase tracking-wider px-[5px] py-[1px] brutal-border-soft text-[var(--color-fg-muted)]">{g}</span>
              ))}
              {media.note !== undefined && <ScoreBadge n={media.note} />}
            </div>
            {(media.overview || details?.overview) && (
              <p className="font-sans text-[14px] mt-4 leading-[1.6] text-[var(--color-fg-muted)] max-w-[680px]">{media.overview || details?.overview}</p>
            )}

            {/* Boutons platforms — uniquement celles qui contiennent vraiment + Stremio */}
            {links.length > 0 && (
              <div className="mt-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] mb-2">→ REGARDER {details?.providers ? `· dispo sur ${details.providers.length} plateforme(s)` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {links.map(l => (
                    <a key={l.key} href={l.href} target="_blank" rel="noopener" className="px-3 py-2 font-mono text-[11px] uppercase tracking-wider font-bold hover:opacity-85 transition flex items-center gap-2" style={{ background: l.color, color: '#fff' }}>
                      {l.emoji && <span>{l.emoji}</span>}
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Statut switch */}
            <div className="mt-5 flex flex-wrap gap-2 items-center">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">→ STATUT :</span>
              {(['à-voir','en-cours','vu','abandonné'] as const).map(s => (
                <button key={s} onClick={() => updateStatut(s)} className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider brutal-border-soft transition ${media.statut === s ? STAT_COLOR[s] : 'hover-paper'}`}>{s}</button>
              ))}
            </div>

            {/* Note 1-10 */}
            <div className="mt-3 flex items-center gap-1 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] mr-2">→ NOTE :</span>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} onClick={() => updateNote(n)} className={`w-7 h-7 font-mono text-[10px] tabular-nums brutal-border-soft hover:bg-[var(--color-acc-green)] hover:text-[var(--color-bg)] transition ${media.note === n ? 'bg-[var(--color-acc-green)] text-[var(--color-bg)] font-bold' : ''}`}>{n}</button>
              ))}
              {media.note !== undefined && (
                <button onClick={() => updateNote(null)} title="Effacer la note" className="ml-2 font-mono text-[10px] text-[var(--color-fg-faint)] hover:text-[var(--color-acc-red)]">×</button>
              )}
            </div>

            {media.statut === 'vu' && (
              <div className="mt-3 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">→ VU LE :</span>
                <input type="date" defaultValue={media.date_fin || ''} key={media.id + (media.date_fin || '')}
                  onChange={e => updateDateFin(e.target.value)}
                  className="brutal-border-soft bg-[var(--color-bg-paper)] px-2 py-[2px] font-mono text-[11px]" />
              </div>
            )}

            {saga.length > 1 && (
              <div className="mt-6">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] mb-2">→ SAGA {media.saga} · {saga.filter(m => m.statut === 'vu').length}/{saga.length} VUS DANS LE VAULT</p>
                <div className="flex gap-2 flex-wrap">
                  {saga.map(m => (
                    <button key={m.id} onClick={() => m.id !== media.id && onPick(m)} title={`${m.title}${m.annee ? ` (${m.annee})` : ''}`}
                      className={`relative w-[72px] aspect-[2/3] overflow-hidden brutal-border-soft bg-[var(--color-bg-soft)] ${m.id === media.id ? 'outline outline-2 outline-[var(--color-fg)]' : 'hover:brightness-110'}`}>
                      {m.image_url && <img src={m.image_url} alt={m.title} loading="lazy" className="w-full h-full object-cover" />}
                      {m.note !== undefined && <span className="absolute top-0 right-0"><ScoreBadge n={m.note} /></span>}
                      {m.statut !== 'vu' && <span className={`absolute bottom-0 inset-x-0 font-mono text-[8px] uppercase tracking-wider ${STAT_COLOR[m.statut || ''] || ''}`}>{m.statut}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-2">
              <button onClick={remove} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider brutal-border-soft text-[var(--color-acc-red)] hover:bg-[var(--color-acc-red)] hover:text-[var(--color-bg)]">× SUPPRIMER</button>
              {savedFlash && (
                <span className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider bg-[var(--color-acc-green)] text-[var(--color-bg)] anim-fade-in">{savedFlash}</span>
              )}
            </div>
          </div>
        </div>
      </div>
      {showFullTrailer && <TrailerModal media={mergedMedia} onClose={() => setShowFullTrailer(false)} />}
    </>
  );
}

function SearchPanel({ known, onClose, onAdded }: { known: Map<string, string>; onClose: () => void; onAdded: () => void }) {
  const [searchType, setSearchType] = useState<'movie' | 'tv' | 'book'>('movie');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) { setHits([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/media/search?q=${encodeURIComponent(query)}&type=${searchType}`).then(r => r.json());
        setHits(r.hits || []);
      } finally { setSearching(false); }
    }, 250);
  }, [query, searchType]);

  async function addHit(hit: SearchHit, statut: 'à-voir' | 'en-cours' | 'vu') {
    const typeInfo = SEARCH_TYPES.find(t => t.key === hit.kind);
    setAdding(hit.externalId + statut);
    try {
      await fetch('/api/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: hit.title, categorie: typeInfo?.categorie || 'autre',
          annee: hit.year, auteur: hit.authors?.join(', '),
          image_url: hit.poster, backdrop_url: hit.backdrop,
          external_id: hit.externalId, external_source: hit.source,
          statut, overview: hit.overview,
        }),
      });
      onAdded();
    } finally { setAdding(null); }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="fixed inset-x-2 top-[4vh] bottom-[4vh] md:inset-x-[10vw] z-[101] brutal-border bg-[var(--color-bg)] flex flex-col anim-fade-in">
        <header className="px-5 py-3 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center gap-3">
          <span className="font-section">+ AJOUTER · {searching ? 'recherche…' : `${hits.length} résultats`}</span>
          <div className="flex ml-auto">
            {SEARCH_TYPES.map(t => (
              <button key={t.key} onClick={() => setSearchType(t.key)} className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider brutal-border-soft ${searchType === t.key ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'hover-paper'}`}>{t.label}</button>
            ))}
          </div>
          <button onClick={onClose} className="font-mono text-[14px] leading-none hover:text-[var(--color-acc-red)] ml-2">✕</button>
        </header>
        <div className="p-5">
          <input
            ref={inputRef}
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder={`Cherche un ${searchType === 'movie' ? 'film' : searchType === 'tv' ? 'série' : 'livre'}…`}
            className="w-full px-4 py-3 brutal-border bg-[var(--color-bg-paper)] font-sans text-[18px]"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {hits.length === 0 && query && !searching && (
            <p className="text-center font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-faint)] py-8">— Aucun résultat —</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {hits.map(h => (
              <div key={h.externalId} className="brutal-border-soft bg-[var(--color-bg-paper)] flex flex-col">
                {h.poster ? (
                  <img src={h.poster} alt={h.title} className="w-full aspect-[2/3] object-cover" loading="lazy" />
                ) : (
                  <div className="w-full aspect-[2/3] bg-[var(--color-bg-soft)] flex items-center justify-center font-sans font-semibold text-[14px] text-center p-2">{h.title}</div>
                )}
                <div className="p-2 flex-1 flex flex-col">
                  <p className="font-sans text-[13px] leading-tight line-clamp-2 font-bold">{h.title}</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] mt-1">{h.year || '—'}{h.voteAverage ? ` · ${h.voteAverage.toFixed(1)}/10` : ''}{h.authors?.length ? ` · ${h.authors[0]}` : ''}</p>
                  {known.has(h.source + ':' + h.externalId) && (
                    <p className="font-mono text-[9px] uppercase tracking-wider mt-1 text-[var(--color-acc-green)]">DÉJÀ DANS LE VAULT · {known.get(h.source + ':' + h.externalId)}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 brutal-border-soft border-t-[1.5px]">
                  {(['à-voir','en-cours','vu'] as const).map(s => (
                    <button key={s} onClick={() => addHit(h, s)} disabled={adding === h.externalId + s} className={`py-[6px] font-mono text-[9px] uppercase tracking-wider border-r border-[var(--color-border-soft)] last:border-r-0 ${STAT_COLOR[s] || ''} hover:opacity-85 disabled:opacity-40`}>{adding === h.externalId + s ? '…' : s}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function MediaBoard() {
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [trailer, setTrailer] = useState<Media | null>(null);
  const [view, setView] = useState<'affiche' | 'collection' | 'sagas' | 'noter'>('affiche');
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);
  const picked = media.find(m => m.id === pickedId) || null;   // toujours la version à jour après un changement
  const setPicked = (m: Media | null) => setPickedId(m?.id || null);

  async function refresh() {
    const r = await fetch('/api/media').then(r => r.json());
    setMedia(r.media || []);
    setLoading(false);
    return (r.media || []) as Media[];
  }
  // fiches film/série jamais enrichies (ajouts par l'agent, anciennes fiches) : enrichissement TMDB en tâche de fond
  async function enrichIfNeeded(list: Media[]) {
    if (!list.some(m => m.external_source === 'tmdb' && m.external_id && (m.categorie === 'film' || m.categorie === 'série') && !m.enrichi)) return;
    let st = await fetch('/api/media/enrich', { method: 'POST' }).then(r => r.json()).catch(() => null);
    while (st?.running) {
      setEnriching({ done: st.done, total: st.total });
      await new Promise(r => setTimeout(r, 3000));
      st = await fetch('/api/media/enrich').then(r => r.json()).catch(() => null);
    }
    setEnriching(null);
    await refresh();
  }
  useEffect(() => {
    refresh().then(enrichIfNeeded);
    const v = new URLSearchParams(location.search).get('vue');  // /media?vue=collection, ?vue=sagas ou ?vue=noter (favoris)
    if (v === 'collection' || v === 'sagas' || v === 'noter') setView(v);
  }, []);
  // Mise à jour locale immédiate (notation rapide) : pas de rechargement des ~400 fiches à chaque note
  const patchLocal = (id: string, patch: Partial<Media>) => setMedia(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  const toRate = media.filter(m => m.statut === 'vu' && m.note === undefined && !m.plus_tard).length;
  const sagaCount = new Set(media.filter(m => m.saga_id && m.categorie === 'film').map(m => m.saga_id)).size;
  const known = useMemo(() => new Map(media.filter(m => m.external_id).map(m => [`${m.external_source}:${m.external_id}`, m.statut || ''])), [media]);

  // Rangées dérivées : à voir classés par note TMDB (tous les added_at d'import sont identiques), suites de saga, vus datés
  const groups = useMemo(() => {
    const byTmdb = (a: Media, b: Media) => (b.tmdb_note ?? 0) - (a.tmdb_note ?? 0) || (b.added_at || '').localeCompare(a.added_at || '');
    const sorted = [...media].sort(byTmdb);
    const aVoir = sorted.filter(m => m.statut === 'à-voir');
    // prochain film à voir des sagas déjà entamées
    const sagaNext: Media[] = [];
    const sagas = new Map<number, Media[]>();
    media.filter(m => m.saga_id).forEach(m => sagas.set(m.saga_id!, [...(sagas.get(m.saga_id!) || []), m]));
    for (const list of sagas.values()) {
      if (!list.some(m => m.statut === 'vu')) continue;
      const next = list.filter(m => m.statut === 'à-voir').sort((a, b) => (a.annee ?? 0) - (b.annee ?? 0))[0];
      if (next) sagaNext.push(next);
    }
    sagaNext.sort(byTmdb);
    const enCours = sorted.filter(m => m.statut === 'en-cours');
    const heroPool = [...new Set([...enCours, ...sagaNext, ...aVoir])].filter(m => m.backdrop_url || m.image_url);
    // les genres les plus présents dans les films à voir, une rangée chacun
    const genreCount = new Map<string, number>();
    aVoir.filter(m => m.categorie === 'film').forEach(m => m.genre?.forEach(g => genreCount.set(g, (genreCount.get(g) || 0) + 1)));
    const topGenres = [...genreCount].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
    return {
      hero: heroPool.slice(0, 6),
      enCours,
      sagaNext,
      filmsAVoir: aVoir.filter(m => m.categorie === 'film'),
      seriesAVoir: aVoir.filter(m => m.categorie === 'série'),
      parGenre: topGenres.map(g => ({ g, items: aVoir.filter(m => m.categorie === 'film' && m.genre?.includes(g)) })),
      vusRecents: media.filter(m => m.statut === 'vu' && m.date_fin).sort((a, b) => b.date_fin!.localeCompare(a.date_fin!)).slice(0, 25),
      mieuxNotes: media.filter(m => m.statut === 'vu' && (m.note ?? 0) >= 8).sort((a, b) => (b.note ?? 0) - (a.note ?? 0) || a.title.localeCompare(b.title, 'fr')),
      abandonnes: sorted.filter(m => m.statut === 'abandonné'),
      livres: sorted.filter(m => m.categorie === 'livre'),
      jeux: sorted.filter(m => m.categorie === 'jeu'),
      autres: sorted.filter(m => !['film','série','livre','jeu'].includes(m.categorie)),
    };
  }, [media]);

  return (
    <>
      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none;}.hide-scrollbar{scrollbar-width:none;}`}</style>
      <div className="h-full overflow-y-auto anim-fade-in bg-[var(--color-bg)]">
        {/* Hero ou empty state */}
        {view === 'affiche' && groups.hero.length > 0 ? (  /* bandeau réservé à « à l'affiche » : collection et notation vont droit au but */
          <Hero items={groups.hero} onPick={setPicked} onTrailer={setTrailer} onAdd={() => setShowSearch(true)} count={media.length} loading={loading} />
        ) : (
          <header className="px-8 pt-8 pb-6 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">FILMS · SÉRIES · LIVRES · JEUX</p>
              <h1 className="font-display text-[clamp(48px,11.5vw,128px)] mt-1 leading-[0.9]">MEDIA.</h1>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">{loading ? 'LOADING…' : `${media.length} ENTRIES`}</span>
              <button onClick={() => setShowSearch(true)} className="px-3 py-1 font-mono text-[11px] uppercase tracking-wider btn-primary">+ ADD</button>
            </div>
          </header>
        )}

        {media.length === 0 && !loading && (
          <div className="brutal-border bg-[var(--color-bg-paper)] p-8 mx-8 mt-6 max-w-[640px]">
            <p className="font-display text-[32px] tracking-[-0.02em] mb-3">VAULT VIDE.</p>
            <p className="font-sans text-[13px] text-[var(--color-fg-muted)] leading-[1.55]">
              Clique <span className="kbd">+ ADD</span> en haut à droite, cherche un film/série/livre, choisis le statut. Le poster + backdrop sont récupérés automatiquement.
            </p>
          </div>
        )}

        {/* Vues : à l'affiche (rangées), collection complète, notation rapide */}
        <div className="px-8 pt-6 pb-4 flex gap-1">
          {([['affiche', "À L'AFFICHE"], ['collection', 'COLLECTION'], ['sagas', `SAGAS${sagaCount ? ` · ${sagaCount}` : ''}`], ['noter', `NOTER${toRate ? ` · ${toRate}` : ''}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)}
              className={`px-3 py-[5px] font-mono text-[12px] uppercase tracking-wider brutal-border-soft ${view === k ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'hover-paper'}`}>{l}</button>
          ))}
          {enriching && (
            <span className="ml-3 self-center font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">ENRICHISSEMENT TMDB · {enriching.done}/{enriching.total}</span>
          )}
        </div>
        {view === 'collection' && <Collection items={media} onPick={setPickedId} />}
        {view === 'sagas' && <Sagas items={media} onPick={setPickedId} onPatched={patchLocal} onAdded={async () => { await refresh(); }} />}
        {view === 'noter' && <QuickRate items={media} onPatched={patchLocal} />}

        {/* Rangées */}
        <div className="pt-2 pb-12" hidden={view !== 'affiche'}>
          <Row title="EN COURS" items={groups.enCours} onPick={setPicked} />
          <Row title="SUITE DE SAGA" items={groups.sagaNext} onPick={setPicked} />
          <Row title="FILMS À VOIR" items={groups.filmsAVoir} onPick={setPicked} />
          <Row title="SÉRIES À VOIR" items={groups.seriesAVoir} onPick={setPicked} />
          {groups.parGenre.map(({ g, items }) => <Row key={g} title={`À VOIR · ${g.toUpperCase()}`} items={items} onPick={setPicked} />)}
          <Row title="VUS RÉCEMMENT" items={groups.vusRecents} onPick={setPicked} />
          <Row title="MIEUX NOTÉS" items={groups.mieuxNotes} onPick={setPicked} />
          <Row title="LIVRES" items={groups.livres} onPick={setPicked} />
          <Row title="JEUX" items={groups.jeux} onPick={setPicked} />
          <Row title="ABANDONNÉS" items={groups.abandonnes} onPick={setPicked} />
          <Row title="AUTRES" items={groups.autres} onPick={setPicked} />
        </div>
      </div>

      {showSearch && <SearchPanel known={known} onClose={() => setShowSearch(false)} onAdded={refresh} />}
      {picked && <DetailModal media={picked} all={media} onPick={setPicked} onClose={() => setPicked(null)} onChanged={refresh} />}
      {trailer && <TrailerModal media={trailer} onClose={() => setTrailer(null)} />}
    </>
  );
}
