import { useEffect, useMemo, useState } from 'react';

// Collection complète + notation rapide, dans l'esprit SensCritique (tout voir, tout noter vite)
export interface CollectionItem {
  id: string; title: string; categorie: string; annee?: number; note?: number; statut?: string;
  image_url?: string; added_at?: string; genre?: string[];
  date_fin?: string; saga?: string; saga_id?: number; tmdb_note?: number; plus_tard?: boolean;
}

const TYPES = [['tous', 'TOUT'], ['film', 'FILMS'], ['série', 'SÉRIES'], ['livre', 'LIVRES'], ['jeu', 'JEUX']];
const STATUTS = [['vu', 'VUS'], ['à-voir', 'À VOIR'], ['en-cours', 'EN COURS'], ['abandonné', 'ABANDONNÉS'], ['tous', 'TOUS']];
const SORTS: [string, string, (a: CollectionItem, b: CollectionItem) => number][] = [
  ['vu', 'VU LE', (a, b) => (b.date_fin || '').localeCompare(a.date_fin || '') || (b.note ?? -1) - (a.note ?? -1)],
  ['ajout', 'AJOUT', (a, b) => (b.added_at || '').localeCompare(a.added_at || '')],
  ['note', 'NOTE', (a, b) => (b.note ?? -1) - (a.note ?? -1)],
  ['tmdb', 'TMDB', (a, b) => (b.tmdb_note ?? -1) - (a.tmdb_note ?? -1)],
  ['annee', 'ANNÉE', (a, b) => (b.annee ?? 0) - (a.annee ?? 0)],
  ['titre', 'TITRE', (a, b) => a.title.localeCompare(b.title, 'fr')],
];
export const chip = (active: boolean) =>
  `px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft ${active ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'hover-paper'}`;
const select = 'brutal-border-soft bg-[var(--color-bg-paper)] px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider focus:outline-none';
export const noteColor = (n: number) => (n >= 8 ? 'var(--color-acc-green)' : n >= 6 ? 'var(--color-acc-yellow)' : 'var(--color-acc-red)');
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// null efface la clé côté vault (note retirée, date effacée…)
export async function patchMedia(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
}

export function Collection({ items, onPick }: { items: CollectionItem[]; onPick: (id: string) => void }) {
  const [type, setType] = useState('tous');
  const [statut, setStatut] = useState('vu');
  const [sort, setSort] = useState('vu');
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [decade, setDecade] = useState('');
  const genres = useMemo(() => {
    const n = new Map<string, number>();
    items.forEach(m => m.genre?.forEach(g => n.set(g, (n.get(g) || 0) + 1)));
    return [...n].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [items]);
  const decades = useMemo(() => [...new Set(items.filter(m => m.annee).map(m => Math.floor(m.annee! / 10) * 10))].sort((a, b) => b - a), [items]);
  const shown = useMemo(() => items
    .filter(m => type === 'tous' || m.categorie === type)
    .filter(m => statut === 'tous' || m.statut === statut)
    .filter(m => !genre || m.genre?.includes(genre))
    .filter(m => !decade || (m.annee !== undefined && Math.floor(m.annee / 10) * 10 === Number(decade)))
    .filter(m => !q || fold(m.title).includes(fold(q)))
    .sort(SORTS.find(s => s[0] === sort)![2]), [items, type, statut, sort, q, genre, decade]);
  const seen = items.filter(m => m.statut === 'vu');
  const rated = seen.filter(m => m.note !== undefined);
  const avg = rated.length ? (rated.reduce((s, m) => s + (m.note || 0), 0) / rated.length).toFixed(1).replace('.', ',') : '—';

  return (
    <section className="px-8 pb-12">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] mb-3">
        {seen.length} VUS · {rated.length} NOTÉS · MOYENNE {avg} · {items.filter(m => m.statut === 'à-voir').length} À VOIR
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4">
        <div className="flex gap-1">{TYPES.map(([k, l]) => <button key={k} className={chip(type === k)} onClick={() => setType(k)}>{l}</button>)}</div>
        <div className="flex gap-1">{STATUTS.map(([k, l]) => <button key={k} className={chip(statut === k)} onClick={() => setStatut(k)}>{l}</button>)}</div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-faint)] mr-1">TRI</span>
          {SORTS.map(([k, l]) => <button key={k} className={chip(sort === k)} onClick={() => setSort(k)}>{l}</button>)}
        </div>
        <select value={genre} onChange={e => setGenre(e.target.value)} className={select}>
          <option value="">TOUS GENRES</option>
          {genres.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={decade} onChange={e => setDecade(e.target.value)} className={select}>
          <option value="">TOUTES ANNÉES</option>
          {decades.map(d => <option key={d} value={d}>ANNÉES {String(d).slice(2)}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un titre…"
          className="brutal-border-soft bg-[var(--color-bg-paper)] px-2 py-[3px] font-sans text-[12px] w-[200px] focus:outline-none" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">{shown.length} TITRES</span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
        {shown.map(m => (
          <button key={m.id} onClick={() => onPick(m.id)} className="text-left group">
            <div className="relative aspect-[2/3] overflow-hidden brutal-border-soft bg-[var(--color-bg-soft)]">
              {m.image_url
                ? <img src={m.image_url} alt={m.title} loading="lazy" className="w-full h-full object-cover transition group-hover:brightness-110" />
                : <div className="w-full h-full flex items-center justify-center p-2 text-center font-sans text-[12px]">{m.title}</div>}
              {m.note !== undefined && (
                <span className="absolute top-1 right-1 font-mono text-[11px] font-bold tabular-nums px-[5px]" style={{ background: noteColor(m.note), color: 'var(--color-bg)' }}>{m.note}</span>
              )}
            </div>
            <p className="font-sans text-[11px] leading-tight mt-1 line-clamp-2">{m.title}</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-faint)]">{m.annee || ''}{m.categorie === 'série' ? ' · série' : ''}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Notation rapide des vus sans note, sagas regroupées : 1-9, 0 = 10, espace = passer, L = plus tard, retour arrière = annuler */
export function QuickRate({ items, onPatched }: { items: CollectionItem[]; onPatched: (id: string, patch: Partial<CollectionItem>) => void }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [withLater, setWithLater] = useState(false);
  const [history, setHistory] = useState<{ id: string; prev: Record<string, unknown> }[]>([]);
  const later = items.filter(m => m.statut === 'vu' && m.note === undefined && m.plus_tard).length;
  // les films d'une même saga se suivent, dans l'ordre de sortie
  const queue = items
    .filter(m => m.statut === 'vu' && m.note === undefined && (withLater || !m.plus_tard) && !skipped.includes(m.id))
    .sort((a, b) => fold(a.saga || a.title).localeCompare(fold(b.saga || b.title)) || (a.annee ?? 0) - (b.annee ?? 0));
  const m = queue[0];

  const apply = (patch: Record<string, unknown>) => {
    if (!m) return;
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) prev[k] = (m as any)[k] ?? null;
    setHistory(h => [...h.slice(-19), { id: m.id, prev }]);
    onPatched(m.id, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? undefined])) as Partial<CollectionItem>);
    patchMedia(m.id, patch);
  };
  const rate = (n: number) => apply({ note: n, plus_tard: null });
  const notSeen = () => apply({ statut: 'à-voir' });
  const dropped = () => apply({ statut: 'abandonné' });
  const postpone = () => apply({ plus_tard: true });
  const skip = () => { if (m) setSkipped(s => [...s, m.id]); };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(h => h.slice(0, -1));
    setSkipped(s => s.filter(x => x !== last.id));
    onPatched(last.id, Object.fromEntries(Object.entries(last.prev).map(([k, v]) => [k, v ?? undefined])) as Partial<CollectionItem>);
    patchMedia(last.id, last.prev);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); rate(e.key === '0' ? 10 : Number(e.key)); }
      else if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); skip(); }
      else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); postpone(); }
      else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toolbar = (
    <div className="flex gap-2 flex-wrap">
      {history.length > 0 && <button className={chip(false)} onClick={undo}>ANNULER</button>}
      {later > 0 && <button className={chip(withLater)} onClick={() => setWithLater(v => !v)}>{later} PLUS TARD {withLater ? 'INCLUS' : 'MIS DE CÔTÉ'}</button>}
    </div>
  );
  if (!m) return (
    <section className="px-8 pb-12">
      <p className="font-display text-[32px]">TOUT EST NOTÉ.</p>
      <p className="font-sans text-[13px] text-[var(--color-fg-muted)] mb-3">Plus aucun vu sans note{skipped.length ? ` (${skipped.length} passés dans cette session)` : ''}.</p>
      {toolbar}
    </section>
  );
  const sagaItems = m.saga_id ? items.filter(x => x.saga_id === m.saga_id).sort((a, b) => (a.annee ?? 0) - (b.annee ?? 0)) : [];
  return (
    <section className="px-8 pb-12">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          {queue.length} VUS À NOTER · TOUCHES 1 À 9, 0 = 10 · ESPACE = PASSER · L = PLUS TARD · RETOUR = ANNULER
        </p>
        {toolbar}
      </div>
      <div className="flex gap-6 items-start flex-wrap">
        <div className="w-[220px] aspect-[2/3] overflow-hidden brutal-border bg-[var(--color-bg-soft)] shrink-0">
          {m.image_url && <img src={m.image_url} alt={m.title} className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-[260px]">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            {m.categorie}{m.annee ? ` · ${m.annee}` : ''}{m.saga ? ` · SAGA ${m.saga} · ${sagaItems.findIndex(x => x.id === m.id) + 1}/${sagaItems.length}` : ''}
          </p>
          <h2 className="font-display text-[44px] leading-[1] mt-1 mb-5">{m.title}</h2>
          <div className="flex flex-wrap gap-1 mb-4">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => rate(n)} className="w-11 h-11 brutal-border-soft hover-paper font-display text-[22px] tabular-nums"
                onMouseEnter={e => (e.currentTarget.style.background = noteColor(n))} onMouseLeave={e => (e.currentTarget.style.background = '')}>{n}</button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className={chip(false)} onClick={skip}>PASSER</button>
            <button className={chip(false)} onClick={postpone}>PLUS TARD</button>
            <button className={chip(false)} onClick={notSeen}>PAS VU → À VOIR</button>
            <button className={chip(false)} onClick={dropped}>ABANDONNÉ</button>
          </div>
          {sagaItems.length > 1 && (
            <div className="mt-6">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-faint)] mb-2">LA SAGA DANS LE VAULT</p>
              <div className="flex gap-2 flex-wrap">
                {sagaItems.map(x => (
                  <div key={x.id} className={`relative w-[64px] aspect-[2/3] overflow-hidden brutal-border-soft bg-[var(--color-bg-soft)] ${x.id === m.id ? 'outline outline-2 outline-[var(--color-fg)]' : 'opacity-70'}`} title={`${x.title}${x.annee ? ` (${x.annee})` : ''}`}>
                    {x.image_url && <img src={x.image_url} alt={x.title} loading="lazy" className="w-full h-full object-cover" />}
                    {x.note !== undefined && <span className="absolute top-0 right-0 font-mono text-[10px] font-bold px-[3px]" style={{ background: noteColor(x.note), color: 'var(--color-bg)' }}>{x.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
