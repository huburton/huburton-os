import { useMemo, useState } from 'react';
import { chip, fold, noteColor, patchMedia, type CollectionItem } from './MediaCollection.tsx';

// Un film d'une saga TMDB, croisé avec le vault (id/statut/note s'il y est déjà)
interface Part {
  externalId: string; title: string; year?: number; poster?: string; backdrop?: string; overview?: string; released: boolean;
  id?: string; statut?: string; note?: number;
}

const STAT_LABEL: Record<string, string> = { 'vu': 'VU', 'à-voir': 'À VOIR', 'en-cours': 'EN COURS', 'abandonné': 'ABANDONNÉ' };

/** Sagas (collections TMDB) : progression, films manquants à ajouter, notation rapide des vus */
export function Sagas({ items, onPick, onPatched, onAdded }: {
  items: CollectionItem[];
  onPick: (id: string) => void;
  onPatched: (id: string, patch: Partial<CollectionItem>) => void;
  onAdded: () => Promise<void>;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [parts, setParts] = useState<Record<number, Part[] | 'loading' | 'error'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const sagas = useMemo(() => {
    const by = new Map<number, CollectionItem[]>();
    for (const m of items) if (m.saga_id && m.categorie === 'film') by.set(m.saga_id, [...(by.get(m.saga_id) || []), m]);
    return [...by].map(([id, list]) => {
      list.sort((a, b) => (a.annee ?? 0) - (b.annee ?? 0));
      const seen = list.filter(m => m.statut === 'vu');
      const rated = seen.filter(m => m.note !== undefined);
      return {
        id, name: list[0]!.saga || '', list, seen: seen.length,
        toSee: list.filter(m => m.statut === 'à-voir' || m.statut === 'en-cours').length,
        avg: rated.length ? rated.reduce((s, m) => s + (m.note || 0), 0) / rated.length : undefined,
      };
    })
      // d'abord les sagas entamées avec une suite à voir, puis les plus grosses
      .sort((a, b) => Number(b.seen > 0 && b.toSee > 0) - Number(a.seen > 0 && a.toSee > 0) || b.list.length - a.list.length || a.name.localeCompare(b.name, 'fr'));
  }, [items]);
  const shown = sagas.filter(s => !q || fold(s.name).includes(fold(q)));

  async function load(id: number) {
    setParts(p => ({ ...p, [id]: 'loading' }));
    try {
      const r = await fetch(`/api/media/saga/${id}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setParts(p => ({ ...p, [id]: d.parts }));
    } catch { setParts(p => ({ ...p, [id]: 'error' })); }
  }
  function toggle(id: number) {
    setOpen(o => (o === id ? null : id));
    if (!parts[id] || parts[id] === 'error') load(id);
  }
  async function add(sagaId: number, p: Part, statut: 'à-voir' | 'vu') {
    setBusy(p.externalId + statut);
    try {
      await fetch('/api/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: p.title, categorie: 'film', annee: p.year, image_url: p.poster, backdrop_url: p.backdrop,
          external_id: p.externalId, external_source: 'tmdb', statut, overview: p.overview,
        }),
      });
      await onAdded();
      await load(sagaId);
    } finally { setBusy(null); }
  }
  function rate(sagaId: number, p: Part, n: number) {
    if (!p.id) return;
    onPatched(p.id, { note: n, plus_tard: undefined });
    patchMedia(p.id, { note: n, plus_tard: null });
    setParts(all => {
      const list = all[sagaId];
      return Array.isArray(list) ? { ...all, [sagaId]: list.map(x => (x.externalId === p.externalId ? { ...x, note: n } : x)) } : all;
    });
  }

  if (sagas.length === 0) return (
    <section className="px-8 pb-12">
      <p className="font-display text-[32px]">AUCUNE SAGA.</p>
      <p className="font-sans text-[13px] text-[var(--color-fg-muted)]">Les sagas apparaissent une fois les fiches enrichies depuis TMDB.</p>
    </section>
  );
  return (
    <section className="px-8 pb-12">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
          {sagas.length} SAGAS · {sagas.filter(s => s.seen > 0 && s.toSee > 0).length} À POURSUIVRE
        </p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher une saga…"
          className="brutal-border-soft bg-[var(--color-bg-paper)] px-2 py-[3px] font-sans text-[12px] w-[200px] focus:outline-none" />
      </div>
      <div className="flex flex-col gap-2">
        {shown.map(s => {
          const tm = parts[s.id];
          return (
            <div key={s.id} className="brutal-border-soft bg-[var(--color-bg-paper)]">
              <button onClick={() => toggle(s.id)} className="w-full flex items-center gap-4 p-3 text-left hover-paper">
                <div className="flex -space-x-6 shrink-0">
                  {s.list.slice(0, 5).map(m => (
                    <div key={m.id} className="w-[44px] aspect-[2/3] overflow-hidden brutal-border-soft bg-[var(--color-bg-soft)]">
                      {m.image_url && <img src={m.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[22px] leading-[1.05] truncate">{s.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] mt-1">
                    {s.seen}/{s.list.length} VUS DANS LE VAULT{s.toSee ? ` · ${s.toSee} À VOIR` : ''}{s.avg !== undefined ? ` · MOYENNE ${s.avg.toFixed(1).replace('.', ',')}` : ''}
                  </p>
                </div>
                <span className="font-mono text-[14px] text-[var(--color-fg-muted)]">{open === s.id ? '−' : '+'}</span>
              </button>
              {open === s.id && (
                <div className="px-3 pb-4 pt-1">
                  {tm === 'loading' && <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">CHARGEMENT DE LA SAGA…</p>}
                  {tm === 'error' && <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-acc-red)]">TMDB INDISPONIBLE — RÉESSAYER PLUS TARD</p>}
                  {Array.isArray(tm) && (
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
                      {tm.map((p, i) => (
                        <div key={p.externalId} className="flex flex-col">
                          <button onClick={() => p.id && onPick(p.id)} disabled={!p.id}
                            className={`relative aspect-[2/3] overflow-hidden brutal-border-soft bg-[var(--color-bg-soft)] ${p.id ? 'group' : 'opacity-45 cursor-default'}`}>
                            {p.poster
                              ? <img src={p.poster} alt={p.title} loading="lazy" className="w-full h-full object-cover transition group-hover:brightness-110" />
                              : <div className="w-full h-full flex items-center justify-center p-2 text-center font-sans text-[12px]">{p.title}</div>}
                            <span className="absolute top-1 left-1 font-mono text-[9px] font-bold px-[4px] bg-[var(--color-fg)] text-[var(--color-bg)]">{i + 1}</span>
                            {p.note !== undefined && (
                              <span className="absolute top-1 right-1 font-mono text-[11px] font-bold tabular-nums px-[5px]" style={{ background: noteColor(p.note), color: 'var(--color-bg)' }}>{p.note}</span>
                            )}
                          </button>
                          <p className="font-sans text-[11px] leading-tight mt-1 line-clamp-2">{p.title}</p>
                          <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-faint)]">
                            {p.year || ''}{p.statut ? ` · ${STAT_LABEL[p.statut] || p.statut}` : !p.released ? ' · À VENIR' : ' · PAS DANS LE VAULT'}
                          </p>
                          {!p.id && p.released && (
                            <div className="grid grid-cols-2 gap-1 mt-1">
                              {(['à-voir', 'vu'] as const).map(st => (
                                <button key={st} onClick={() => add(s.id, p, st)} disabled={busy === p.externalId + st} className={chip(false) + ' disabled:opacity-40'}>
                                  {busy === p.externalId + st ? '…' : `+ ${STAT_LABEL[st]}`}
                                </button>
                              ))}
                            </div>
                          )}
                          {p.id && p.statut === 'vu' && p.note === undefined && (
                            <div className="grid grid-cols-5 gap-[2px] mt-1">
                              {Array.from({ length: 10 }, (_, k) => k + 1).map(n => (
                                <button key={n} onClick={() => rate(s.id, p, n)} className="h-6 brutal-border-soft hover-paper font-mono text-[10px] tabular-nums"
                                  onMouseEnter={e => (e.currentTarget.style.background = noteColor(n))} onMouseLeave={e => (e.currentTarget.style.background = '')}>{n}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
