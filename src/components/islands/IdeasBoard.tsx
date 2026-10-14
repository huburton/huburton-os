import { useEffect, useState } from 'react';

interface Idea { id: string; title: string; domaine: string; statut: string; priorite?: number; effort?: string; budget?: number; dateCreation?: string; }

const STATUS_COLOR: Record<string, string> = {
  brute: 'bg-[var(--color-acc-yellow)] text-[var(--color-fg)]',
  exploration: 'bg-[var(--color-acc-orange)] text-[var(--color-bg)]',
  prototype: 'bg-[var(--color-acc-blue)] text-[var(--color-bg)]',
  concrétisé: 'bg-[var(--color-acc-green)] text-[var(--color-bg)]',
  abandonné: 'bg-[var(--color-fg-faint)] text-[var(--color-bg)]',
};
const DOMAIN_GLYPH: Record<string, string> = {
  '3d': '◇', electronique: '⚡', web: '⌘', business: '$', autre: '○',
};

export default function IdeasBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => fetch('/api/ideas').then(r => r.json()).then(d => setIdeas(d.ideas || [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // Ajout direct dans le kanban Obsidian (colonne « Idées brutes »)
  const add = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: draft }) }).catch(() => {});
    setDraft(''); setSaving(false); load();
  };

  const domains = ['all', ...Array.from(new Set(ideas.map(i => i.domaine)))];
  const filtered = filter === 'all' ? ideas : ideas.filter(i => i.domaine === filter);
  const byStatus = new Map<string, Idea[]>();
  for (const i of filtered) {
    if (!byStatus.has(i.statut)) byStatus.set(i.statut, []);
    byStatus.get(i.statut)!.push(i);
  }

  return (
    <div className="overflow-y-auto h-full anim-fade-in">
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 pt-5 md:pt-6 pb-24">
        <header className="brutal-border-bottom pb-4 mb-6 flex flex-wrap items-end justify-between gap-x-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">BRAINSTORMING · DOMAINES MULTIPLES · DU BRUT AU CONCRET</p>
            <h1 className="font-display text-[clamp(48px,11.5vw,128px)] mt-[0.2em]">IDÉES.</h1>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] pb-2">
            {loading ? 'LOADING…' : `${ideas.length} TOTAL`}
          </span>
        </header>

        <div className="flex gap-2 mb-6">
          <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="Nouvelle idée : enceintes DIY pour la télé, setup PC… (Entrée)"
            className="flex-1 brutal-border-soft bg-[var(--color-bg-paper)] px-3 py-2 font-sans text-[14px] focus:outline-none" />
          <button onClick={add} disabled={!draft.trim() || saving}
            className="px-3 py-2 font-mono text-[11px] uppercase tracking-wider btn-primary disabled:opacity-40">+ IDÉE</button>
        </div>

        {ideas.length === 0 && !loading ? (
          <div className="brutal-border bg-[var(--color-bg-paper)] p-8 text-center">
            <p className="font-display text-[32px] mb-3">AUCUNE IDÉE.</p>
            <p className="font-sans text-[13px] text-[var(--color-fg-muted)] max-w-[460px] mx-auto">Note-la ci-dessus : elle part dans ton kanban Obsidian (idées brutes). Brutes → exploration → prototype → concrétisé.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-6">
              {domains.map(d => (
                <button key={d} onClick={() => setFilter(d)} className={`px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft ${filter === d ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'hover-paper'}`}>
                  {d !== 'all' && DOMAIN_GLYPH[d] ? `${DOMAIN_GLYPH[d]} ` : ''}{d}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((i, idx) => (
                <div key={i.id} className="brutal-border bg-[var(--color-bg-paper)] p-3 hover-paper anim-slide-up" style={{ animationDelay: `${idx * 30}ms` }}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-[28px] leading-none">{DOMAIN_GLYPH[i.domaine] || '○'}</span>
                    <span className={`font-mono text-[9px] uppercase tracking-wider px-[5px] py-[1px] ${STATUS_COLOR[i.statut] || 'bg-[var(--color-fg)] text-[var(--color-bg)]'}`}>{i.statut}</span>
                  </div>
                  <h3 className="font-sans text-[16px] font-semibold leading-[1.2] mt-2">{i.title}</h3>
                  <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)]">
                    {i.priorite !== undefined && <span>P{i.priorite}</span>}
                    {i.effort && <span>{i.effort}</span>}
                    {i.budget !== undefined && i.budget > 0 && <span>{i.budget}€</span>}
                  </div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-faint)] mt-1">{i.domaine}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
