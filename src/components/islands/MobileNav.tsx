import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarDays, FolderKanban, LayoutGrid, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

// Téléphone : barre du bas (Today · Planning · Projects · Plus) + feuille « Plus » avec toutes les pages.
// Persistée entre les navigations ; l'onglet actif suit l'URL.
export const PAGES = [
  { href: '/', label: 'HUB' },
  { href: '/today', label: 'TODAY' },
  { href: '/planning', label: 'PLANNING' },
  { href: '/projects', label: 'PROJECTS' },
  { href: '/media', label: 'MEDIA' },
  { href: '/ideas', label: 'IDÉES' },
  { href: '/ia', label: 'IA' },
  { href: '/system', label: 'STACK' },
  { href: '/brief', label: 'BRIEF' },
];
const TABS = ['/today', '/planning', '/projects'];
const norm = (p: string) => p.replace(/\.html$/, '').replace(/\/$/, '') || '/';

export default function MobileNav() {
  const [path, setPath] = useState('/');
  const [more, setMore] = useState(false);
  const [install, setInstall] = useState<any>(null);

  useEffect(() => {
    const sync = () => { setPath(norm(location.pathname)); setMore(false); };
    sync();
    document.addEventListener('astro:after-swap', sync);
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e); };
    addEventListener('beforeinstallprompt', onPrompt);
    return () => { document.removeEventListener('astro:after-swap', sync); removeEventListener('beforeinstallprompt', onPrompt); };
  }, []);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [more]);

  const tab = (href: string, label: string, icon: React.ReactNode) => {
    const active = path === href;
    return (
      <a href={href} aria-current={active ? 'page' : undefined} className={`mnav-tab${active ? ' on' : ''}`} onClick={() => navigator.vibrate?.(6)}>
        <span className="mnav-ico">{icon}</span>
        <span>{label}</span>
      </a>
    );
  };
  const inMore = !TABS.includes(path);

  return (
    <>
      <nav className="mnav md:hidden" aria-label="Navigation">
        {tab('/today', 'TODAY', <CalendarCheck size={20} strokeWidth={1.7} />)}
        {tab('/planning', 'PLANNING', <CalendarDays size={20} strokeWidth={1.7} />)}
        {tab('/projects', 'PROJECTS', <FolderKanban size={20} strokeWidth={1.7} />)}
        <button className={`mnav-tab${inMore || more ? ' on' : ''}`} onClick={() => setMore(m => !m)} aria-expanded={more} aria-controls="mnav-more">
          <span className="mnav-ico"><LayoutGrid size={20} strokeWidth={1.7} /></span><span>PLUS</span>
        </button>
      </nav>
      {more && <>
        <div className="modal-overlay md:hidden" style={{ zIndex: 70 }} onClick={() => setMore(false)} />
        <section id="mnav-more" className="mnav-sheet md:hidden" aria-label="Toutes les pages">
          <header className="flex items-center justify-between px-4 py-3 brutal-border-bottom">
            <span className="font-section">→ TOUTES LES PAGES</span>
            <button onClick={() => setMore(false)} aria-label="Fermer" className="w-10 h-10 grid place-items-center -mr-2"><X size={18} /></button>
          </header>
          <div className="grid grid-cols-3 gap-2 p-4">
            {PAGES.map(p => (
              <a key={p.href} href={p.href} aria-current={path === p.href ? 'page' : undefined}
                className={`brutal-border min-h-[56px] grid place-items-center px-1 font-mono text-[11px] uppercase tracking-[0.12em] ${path === p.href ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'bg-[var(--color-bg-paper)]'}`}>
                {p.label}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            {install && <button onClick={async () => { await install.prompt(); setInstall(null); }} className="btn-primary px-3 py-[10px] font-mono text-[11px] uppercase tracking-wider">INSTALLER L'APPLI</button>}
            <div className="w-full"><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--color-fg-faint)] mb-1">THÈME</p><ThemeToggle full /></div>
          </div>
        </section>
      </>}
    </>
  );
}
