// Thème de la plateforme : auto (suit le système : clair ou sombre), clair, sombre, OLED (noir pur, anti-marquage).
// Mémorisé par appareil (localStorage « theme ») ; appliqué avant l'affichage par le script de Base.astro.
export type ThemeChoice = 'auto' | 'light' | 'dark' | 'oled'
export const THEMES: { key: ThemeChoice; label: string; short: string }[] = [
  { key: 'auto', label: 'AUTO', short: 'A' },
  { key: 'light', label: 'CLAIR', short: '☼' },
  { key: 'dark', label: 'SOMBRE', short: '◐' },
  { key: 'oled', label: 'OLED', short: '●' },
]
const META: Record<string, string> = { light: '#F2EDE3', dark: '#0E0E0C', oled: '#000000' }

export function getChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem('theme')
    if (v === 'light' || v === 'dark' || v === 'oled' || v === 'auto') return v
  } catch {}
  return document.documentElement.dataset.embed === 'panneau' ? 'dark' : 'auto'
}
export function resolve(choice: ThemeChoice): 'light' | 'dark' | 'oled' {
  if (choice !== 'auto') return choice
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export function applyTheme(choice: ThemeChoice, save = true) {
  const t = resolve(choice)
  document.documentElement.setAttribute('data-theme', t)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', META[t])
  if (save) try { localStorage.setItem('theme', choice) } catch {}
  window.dispatchEvent(new CustomEvent('theme:change', { detail: { choice, theme: t } }))
}
// le mode auto suit les changements du système en direct
if (typeof window !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getChoice() === 'auto') applyTheme('auto', false) })
}
