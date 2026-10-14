import { useEffect, useRef, useState } from 'react';
import { navigate } from 'astro:transitions/client';

const MAP: Record<string, string> = {
  h: '/', t: '/today', p: '/projects', s: '/system', m: '/media', b: '/brief', a: '/planning', i: '/ideas', l: '/ia',
};

export default function GlobalShortcuts() {
  const lastG = useRef<number>(0);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement) return;
      if (document.activeElement instanceof HTMLTextAreaElement) return;
      if (e.key === 'g' && Date.now() - lastG.current >= 1500) {
        lastG.current = Date.now();
        setHint('G + (g|c|h|t|p|s|m|b|f|a|i|j|l)');
        setTimeout(() => setHint(null), 1500);
        return;
      }
      const now = Date.now();
      if (now - lastG.current < 1500 && MAP[e.key.toLowerCase()]) {
        e.preventDefault();
        navigate(MAP[e.key.toLowerCase()]);
        lastG.current = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!hint) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-[var(--color-fg)] text-[var(--color-bg)] px-3 py-1 font-mono text-[11px] uppercase tracking-wider pointer-events-none">{hint}</div>
  );
}
