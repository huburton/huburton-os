import { useEffect, useRef, useState } from 'react';

interface Msg { role: 'user' | 'assistant'; content: string }
interface Choice { key: string; host: 'pc' | 'server'; model: string; label: string; hint: string }

const CHOICES: Choice[] = [
// Alias des modèles dans les routeurs llama.cpp (llama-server --models-preset) : à adapter à ses propres modèles.
  { key: 'pc-27b', host: 'pc', model: 'qwen3.8-27b', label: '27B · PC', hint: 'le plus malin ; active le mode IA (fond animé en pause)' },
  { key: 'pc-9b', host: 'pc', model: 'qwen3.5-9b', label: '9B · PC', hint: 'rapide, tient à côté du fond animé' },
  { key: 'server-moe', host: 'server', model: 'qwen3.6-35b-a3b', label: 'MOE · SERVEUR', hint: 'toujours dispo, même PC éteint' },
];
const STORE = 'ia.chat';
const chip = (active: boolean) =>
  `px-2 py-[3px] font-mono text-[10px] uppercase tracking-wider brutal-border-soft disabled:opacity-35 ${active ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'hover-paper'}`;

/** Discussion avec les modèles locaux : les clés restent côté serveur (API), jamais dans le navigateur */
export default function AiChat({ pcOnline }: { pcOnline: boolean }) {
  const [choice, setChoice] = useState('server-moe');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const first = useRef<Msg[] | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved) { first.current = saved.msgs || []; setMsgs(first.current); setChoice(CHOICES.some(c => c.key === saved.choice) ? saved.choice : 'server-moe'); }
    } catch { /* stockage indisponible */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ msgs, choice })); } catch { /* stockage indisponible */ }
    // seulement quand la conversation avance (pas au chargement : la page sauterait en bas du CHAT)
    if (msgs.length && msgs !== first.current) bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs, choice]);

  const current = CHOICES.find(c => c.key === choice) || CHOICES[2];
  const unavailable = current.host === 'pc' && !pcOnline;

  const send = async () => {
    const text = input.trim();
    if (!text || busy || unavailable) return;
    const history: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setInput(''); setBusy(true); setError(null);
    abort.current = new AbortController();
    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.current.signal,
        body: JSON.stringify({ host: current.host, model: current.model, messages: history }),
      });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '', answer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            answer += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || '';
            setMsgs([...history, { role: 'assistant', content: answer }]);
          } catch { /* ligne partielle */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally { setBusy(false); abort.current = null; }
  };

  return (
    <section className="brutal-border p-4 flex flex-col gap-3 mb-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap brutal-border-bottom pb-2">
        <h2 className="font-display text-[32px] leading-none">CHAT.</h2>
        <div className="flex flex-wrap items-center gap-1">
          {CHOICES.map(c => (
            <button key={c.key} className={chip(choice === c.key)} disabled={c.host === 'pc' && !pcOnline}
              title={c.hint} onClick={() => setChoice(c.key)}>{c.label}</button>
          ))}
          <button className={chip(false)} disabled={busy || !msgs.length} onClick={() => setMsgs([])}>EFFACER</button>
        </div>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
        {current.label} · {current.hint}{unavailable ? ' · PC ÉTEINT : CHOISIS LE MOE DU SERVEUR' : ''}
      </p>
      <div className="flex flex-col gap-2 max-h-[420px] min-h-[120px] overflow-y-auto">
        {!msgs.length && (
          <p className="font-sans text-[13px] text-[var(--color-fg-muted)]">
            Pose une question à tes modèles locaux. Rien ne sort de chez toi : ni cloud, ni clé à saisir.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] px-3 py-2 font-sans text-[13px] leading-[1.5] whitespace-pre-wrap ${m.role === 'user' ? 'self-end bg-[var(--color-fg)] text-[var(--color-bg)]' : 'self-start brutal-border-soft bg-[var(--color-bg-paper)]'}`}>
            {m.content || (busy && i === msgs.length - 1 ? '…' : '')}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-acc-red)]">{error}</p>}
      <div className="flex gap-2 items-end">
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} disabled={unavailable}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Écris ici · Entrée pour envoyer · Maj+Entrée pour aller à la ligne"
          className="flex-1 brutal-border-soft bg-[var(--color-bg-paper)] px-3 py-2 font-sans text-[13px] resize-y focus:outline-none" />
        {busy
          ? <button className={chip(false)} onClick={() => abort.current?.abort()}>STOP</button>
          : <button className={chip(true)} disabled={!input.trim() || unavailable} onClick={send}>ENVOYER</button>}
      </div>
    </section>
  );
}
