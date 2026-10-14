import { useEffect, useState } from 'react';
import { THEMES, applyTheme, getChoice, type ThemeChoice } from '../../lib/theme';

// Sélecteur de thème à 4 positions : AUTO (système) · CLAIR · SOMBRE · OLED. `full` = libellés complets.
export default function ThemeToggle({ full = false }: { full?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>('auto');
  useEffect(() => {
    setChoice(getChoice());
    const on = (e: Event) => setChoice((e as CustomEvent).detail.choice);
    window.addEventListener('theme:change', on);
    return () => window.removeEventListener('theme:change', on);
  }, []);
  return (
    <div role="radiogroup" aria-label="Thème" className="theme-picker flex">
      {THEMES.map(t => (
        <button key={t.key} role="radio" aria-checked={choice === t.key} title={t.key === 'auto' ? 'Suivre le système' : t.label}
          onClick={() => { setChoice(t.key); applyTheme(t.key); }}
          className={`font-mono uppercase tracking-[0.14em] brutal-border-soft -ml-[1.5px] first:ml-0 transition-colors ${full ? 'flex-1 px-2 py-[10px] text-[11px]' : 'px-[7px] py-[3px] text-[10px]'} ${choice === t.key ? 'theme-on' : 'hover-paper text-[var(--color-fg-muted)]'}`}>
          {full ? t.label : t.short}
        </button>
      ))}
    </div>
  );
}
