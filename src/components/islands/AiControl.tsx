import { useEffect, useState } from 'react';
import AiChat from './AiChat.tsx';

interface Gpu { name: string; util: number; vram_used_mib: number; vram_total_mib: number; temp_c: number; power_w: number }
interface Machine {
  host: string; time: string; uptime_s: number; ai_mode: boolean | null; ai_mode_auto?: boolean | null; user_idle: boolean | null;
  gpu: Gpu | null; models: { id: string; status: string }[] | null; services: Record<string, string>;
}
interface AiState { pc: Machine | null; server: Machine | null }

const gib = (mib: number) => (mib / 1024).toFixed(1).replace('.', ',');
const btn = 'px-3 py-[9px] md:px-2 md:py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft hover-paper disabled:opacity-40';
const label = 'font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--color-fg-faint)]';
const dot = (color: string) => <span className="inline-block w-2 h-2 shrink-0" style={{ background: color }} />;
function since(sec: number) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d} J ${h} H` : `${h} H ${String(m).padStart(2, '0')}`;
}
function seen(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return !Number.isFinite(s) ? '' : s < 60 ? `IL Y A ${Math.max(0, s)} S` : `IL Y A ${Math.round(s / 60)} MIN`;
}
const MODEL_STATE: Record<string, string> = { loaded: 'chargé', loading: 'chargement…', unloaded: 'déchargé' };
const MODEL_COLOR: Record<string, string> = {
  loaded: 'var(--color-acc-green)', loading: 'var(--color-acc-orange)', unloaded: 'var(--color-fg-faint)',
};

function MachineCard({ name, sub, host, m, busy, act }: {
  name: string; sub: string; host: 'pc' | 'server'; m: Machine | null | undefined; busy: string | null;
  act: (key: string, url: string, body: unknown) => void;
}) {
  if (m === undefined) return <section className="brutal-border p-4 min-h-[260px]" />;
  const g = m?.gpu;
  const vram = g ? (g.vram_used_mib / g.vram_total_mib) * 100 : 0;
  return (
    <section className="brutal-border bg-[var(--color-bg-paper)] p-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-start justify-between gap-3 brutal-border-bottom pb-2">
        <div className="min-w-0">
          <h2 className="font-display text-[clamp(34px,5vw,40px)] leading-none">{name}</h2>
          <p className={`${label} mt-1`}>{sub}{m ? ` · ALLUMÉ DEPUIS ${since(m.uptime_s)}` : ''}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-2 px-2 py-[3px] brutal-border-soft font-mono text-[10px] uppercase tracking-wider whitespace-nowrap">
          <span className={`inline-block w-2 h-2 ${m?.ai_mode ? 'pulse-dot' : ''}`} style={{ background: m ? 'var(--color-acc-green)' : 'var(--color-acc-red)' }} />
          {m ? (m.ai_mode ? 'MODE IA' : 'EN LIGNE') : 'ÉTEINT'}
        </span>
      </div>

      {!m && (
        <p className="font-sans text-[13px] text-[var(--color-fg-muted)]">
          {host === 'pc'
            ? 'PC éteint ou service d\'état non configuré (AI_PC_STATUS_URL) : le chat passe par le serveur.'
            : 'Serveur injoignable ou non configuré (AI_SERVER_STATUS_URL).'}
        </p>
      )}

      {g && (
        <div>
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider mb-1">
            <span className="text-[var(--color-fg-muted)]">VRAM · {g.name.replace('NVIDIA GeForce ', '')}</span>
            <span className="tabular-nums">{gib(g.vram_used_mib)} / {gib(g.vram_total_mib)} GO</span>
          </div>
          <div className="h-[10px] bg-[var(--color-bg-paper)] relative brutal-border-soft">
            <span className="absolute inset-y-0 left-0 transition-all" style={{ width: `${vram}%`, background: vram > 90 ? 'var(--color-acc-red)' : vram > 70 ? 'var(--color-acc-orange)' : 'var(--color-fg)' }} />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)] mt-1 tabular-nums flex flex-wrap gap-x-3">
            <span>GPU {g.util} % · {g.temp_c} °C · {g.power_w} W</span>
            {m?.user_idle != null && <span>TOI · {m.user_idle ? 'ABSENT' : 'DEVANT LE PC'}</span>}
          </p>
        </div>
      )}

      {m && m.ai_mode !== null && (
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
          <span className="font-mono text-[11px] uppercase tracking-wider flex items-center gap-2">
            {dot(m.ai_mode ? 'var(--color-acc-green)' : 'var(--color-fg-faint)')}MODE IA {m.ai_mode ? (m.ai_mode_auto ? 'ACTIF · AUTO (TU ES ABSENT)' : 'ACTIF') : 'INACTIF'}
          </span>
          <button className={btn} disabled={busy === 'ai-mode'}
            onClick={() => act('ai-mode', '/api/ai/pc/ai-mode', { on: !m.ai_mode })}>
            {busy === 'ai-mode' ? '…' : m.ai_mode ? 'DÉSACTIVER' : 'ACTIVER'}
          </button>
          <span className="font-sans text-[12px] text-[var(--color-fg-muted)] col-span-2">
            Le bureau libère sa VRAM (fond animé en pause) pour qu'un gros modèle tienne entièrement sur le GPU.
          </span>
        </div>
      )}

      {m && (
        <div>
          <p className={`${label} mb-1`}>MODÈLES</p>
          {m.models === null && <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-acc-red)]">ROUTEUR LLAMA.CPP ARRÊTÉ</p>}
          <ul className="flex flex-col">
            {(m.models || []).slice().sort((x, y) => (y.status === 'loaded' ? 1 : 0) - (x.status === 'loaded' ? 1 : 0)).map(md => {
              const key = `${host}:${md.id}`;
              const loaded = md.status === 'loaded';
              return (
                <li key={md.id} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center py-2 brutal-border-bottom last:border-b-0">
                  {dot(MODEL_COLOR[md.status] || 'var(--color-fg-faint)')}
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] tracking-wide">{md.id} <span className="text-[var(--color-fg-faint)] text-[10px] uppercase">· {MODEL_STATE[md.status] || md.status}</span></p>
                    
                  </div>
                  <button className={btn} disabled={busy === key}
                    onClick={() => act(key, `/api/ai/${host}/llm/${loaded ? 'unload' : 'load'}`, { model: md.id })}>
                    {busy === key ? '…' : loaded ? 'DÉCHARGER' : 'CHARGER'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {m && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider mt-auto">
          {Object.entries(m.services).map(([s, st]) => (
            <span key={s} className="flex items-center gap-1">{dot(st === 'active' ? 'var(--color-acc-green)' : 'var(--color-acc-red)')}{s}</span>
          ))}
          <span className="text-[var(--color-fg-faint)] ml-auto">RELEVÉ {seen(m.time)}</span>
        </div>
      )}
    </section>
  );
}

export default function AiControl() {
  const [st, setSt] = useState<AiState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState('');

  const load = () =>
    fetch('/api/ai').then(r => r.json()).then((d: AiState) => {
      setSt(d); setError(null); setUpdated(new Date().toLocaleTimeString('fr-FR'));
    }).catch(() => setError('API injoignable'));

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    // Retour sur l'onglet : état frais tout de suite (sinon un changement fait ailleurs paraissait inversé)
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow); };
  }, []);

  const act = async (key: string, url: string, body: unknown) => {
    setBusy(key);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error || `échec (${r.status})`);
    } catch { setError('API injoignable'); }
    await load();
    setTimeout(() => { load(); setBusy(null); }, 2500); // chargement / mode IA : l'état suit en quelques secondes
  };

  const loadedCount = [st?.pc, st?.server].flatMap(m => m?.models || []).filter(md => md.status === 'loaded').length;

  return (
    <div className="overflow-y-auto h-full anim-fade-in">
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 pt-5 md:pt-6 pb-24">
        <header className="brutal-border-bottom pb-4 mb-5 flex items-end justify-between gap-x-6 gap-y-1 flex-wrap">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
              IA LOCALE · LLAMA.CPP · DEUX MACHINES · AUCUN CLOUD
            </p>
            <h1 className="font-display text-[clamp(48px,11.5vw,128px)] mt-1">IA.</h1>
          </div>
          <div className="flex flex-row flex-wrap md:flex-col md:items-end gap-x-4 gap-y-1 pb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            <span>{loadedCount} MODÈLE{loadedCount > 1 ? 'S' : ''} CHARGÉ{loadedCount > 1 ? 'S' : ''} · PC {st?.pc ? 'ALLUMÉ' : 'ÉTEINT'}</span>
            <span>MIS À JOUR {updated || '—'} · TOUTES LES 5 S</span>
          </div>
        </header>

        {error && <p className="brutal-border p-3 mb-4 font-mono text-[11px] uppercase tracking-wider text-[var(--color-acc-red)]">{error}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <MachineCard name="DESKTOP." sub="PC · GROS GPU · GROS MODÈLES" host="pc" m={st ? st.pc : undefined} busy={busy} act={act} />
          <MachineCard name="SERVER." sub="SERVEUR · PETIT GPU · TOUJOURS ALLUMÉ" host="server" m={st ? st.server : undefined} busy={busy} act={act} />
        </div>

        <AiChat pcOnline={!!st?.pc?.models} />

      </div>
    </div>
  );
}
