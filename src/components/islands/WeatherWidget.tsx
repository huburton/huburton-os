import { useEffect, useState } from 'react';

const LABELS: Record<number, { fr: string; glyph: string }> = {
  0: { fr: 'Ciel clair', glyph: '○' }, 1: { fr: 'Surtout clair', glyph: '◔' },
  2: { fr: 'Partiellement nuageux', glyph: '◑' }, 3: { fr: 'Couvert', glyph: '●' },
  45: { fr: 'Brouillard', glyph: '≈' }, 48: { fr: 'Brouillard givrant', glyph: '≋' },
  51: { fr: 'Bruine légère', glyph: '⋮' }, 53: { fr: 'Bruine modérée', glyph: '⋮⋮' }, 55: { fr: 'Bruine dense', glyph: '⋮⋮⋮' },
  61: { fr: 'Pluie légère', glyph: '╲╲' }, 63: { fr: 'Pluie modérée', glyph: '╲╲╲' }, 65: { fr: 'Pluie forte', glyph: '▎▎▎' },
  71: { fr: 'Neige légère', glyph: '✻' }, 73: { fr: 'Neige modérée', glyph: '✻✻' }, 75: { fr: 'Neige forte', glyph: '✻✻✻' },
  80: { fr: 'Averse légère', glyph: '╲╲' }, 81: { fr: 'Averse modérée', glyph: '╲╲╲' }, 82: { fr: 'Averse violente', glyph: '▎▎▎' },
  95: { fr: 'Orage', glyph: '⚡' }, 96: { fr: 'Orage + grêle', glyph: '⚡▎' }, 99: { fr: 'Orage + grêle forte', glyph: '⚡▎▎' },
};
const DAY_NAMES = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const MONTHS = ['JAN','FÉV','MAR','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC'];

export default function WeatherWidget() {
  const [data, setData] = useState<any>(null);
  const [openDay, setOpenDay] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/weather').then(r => r.json()).then(setData).catch(() => {});
    const i = setInterval(() => fetch('/api/weather').then(r => r.json()).then(setData).catch(() => {}), 10 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  const place = String(data?.place || '').toUpperCase();
  if (!data || !data.current) {
    return (
      <section className="brutal-border bg-[var(--color-bg-paper)] h-full flex flex-col anim-slide-up" style={{ animationDelay: '240ms' }}>
        <header className="px-3 py-1 brutal-border-bottom bg-[var(--color-bg-soft)]">
          <h3 className="font-section">⌘ MÉTÉO{place ? ` · ${place}` : ''}</h3>
        </header>
        <div className="p-3 font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">{data?.error ? 'MÉTÉO DÉSACTIVÉE (HORS LIGNE)' : 'LOADING…'}</div>
      </section>
    );
  }

  const c = data.current;
  const d = data.daily;
  const todayLabel = LABELS[c.weather_code] || { fr: 'Inconnu', glyph: '?' };
  const sel = openDay !== null && d ? openDay : null;

  return (
    <section className="brutal-border bg-[var(--color-bg-paper)] h-full flex flex-col min-h-0 anim-slide-up" style={{ animationDelay: '240ms' }}>
      <header className="px-3 py-1 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between shrink-0">
        <h3 className="font-section">⌘ MÉTÉO · {place}</h3>
        <a href={`https://www.windy.com/?${data.latitude},${data.longitude},11`} target="_blank" rel="noopener" className="font-mono text-[9px] uppercase tracking-wider underline">WINDY →</a>
      </header>

      <button onClick={() => setOpenDay(0)} className="p-4 flex items-end gap-3 text-left hover-paper">
        <span className="font-display text-[64px] leading-none tabular-nums">{Math.round(c.temperature_2m)}°</span>
        <div className="flex-1 mb-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none">{todayLabel.glyph}</span>
            <span className="font-sans text-[13px]">{todayLabel.fr}</span>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)] mt-1">
            RESSENTI {Math.round(c.apparent_temperature)}° · HUM {c.relative_humidity_2m}%
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            VENT {Math.round(c.wind_speed_10m)} km/h · {c.is_day ? '☀ JOUR' : '☾ NUIT'}
          </div>
        </div>
      </button>

      {d && d.time && (
        <div className="px-3 pb-3 grid grid-cols-7 gap-[2px] shrink-0">
          {d.time.map((day: string, i: number) => {
            const date = new Date(day);
            const lbl = LABELS[d.weather_code[i]] || { fr: '?', glyph: '?' };
            const isToday = i === 0;
            return (
              <button key={day} onClick={() => setOpenDay(i)} className={`text-center p-1 brutal-border-soft transition-opacity ${isToday ? 'bg-[var(--color-fg)] text-[var(--color-bg)] hover:opacity-85' : 'bg-[var(--color-bg)] hover-paper'}`}>
                <div className="font-mono text-[8px] uppercase tracking-wider">{DAY_NAMES[date.getDay()]}</div>
                <div className="text-[18px] leading-none my-[2px]">{lbl.glyph}</div>
                <div className="font-mono text-[10px] tabular-nums">{Math.round(d.temperature_2m_max[i])}°</div>
                <div className={`font-mono text-[8px] tabular-nums ${isToday ? 'opacity-70' : 'text-[var(--color-fg-muted)]'}`}>{Math.round(d.temperature_2m_min[i])}°</div>
              </button>
            );
          })}
        </div>
      )}

      {sel !== null && d && (
        <>
          <div className="modal-overlay" onClick={() => setOpenDay(null)} />
          <div className="modal-panel">
            <header className="px-4 py-2 brutal-border-bottom bg-[var(--color-bg-soft)] flex items-center justify-between">
              <span className="font-section">⌘ MÉTÉO · {place} · DÉTAIL</span>
              <button onClick={() => setOpenDay(null)} className="font-mono text-[14px] leading-none hover:text-[var(--color-acc-red)]">✕</button>
            </header>
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              {(() => {
                const date = new Date(d.time[sel]);
                const lbl = LABELS[d.weather_code[sel]] || { fr: '?', glyph: '?' };
                return (
                  <>
                    <div className="flex items-end justify-between mb-4">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
                          {DAY_NAMES[date.getDay()]} · {String(date.getDate()).padStart(2,'0')} {MONTHS[date.getMonth()]} {date.getFullYear()}
                        </p>
                        <h2 className="font-display text-[48px] mt-1">{Math.round(d.temperature_2m_max[sel])}°/{Math.round(d.temperature_2m_min[sel])}°</h2>
                      </div>
                      <div className="text-right">
                        <div className="text-[48px] leading-none">{lbl.glyph}</div>
                        <p className="font-sans text-[14px] mt-1">{lbl.fr}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="brutal-border-soft p-2">
                        <p className="font-section text-[var(--color-fg-muted)]">PRÉCIPITATIONS</p>
                        <p className="font-mono text-[16px] tabular-nums mt-1">{d.precipitation_sum[sel]}mm</p>
                      </div>
                      <div className="brutal-border-soft p-2">
                        <p className="font-section text-[var(--color-fg-muted)]">SOLEIL</p>
                        <p className="font-mono text-[12px] tabular-nums mt-1">
                          ↑ {new Date(d.sunrise[sel]).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ·
                          ↓ {new Date(d.sunset[sel]).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5">
                      <p className="font-section text-[var(--color-fg-muted)] mb-2">LIENS EXTERNES</p>
                      <div className="grid grid-cols-3 gap-2">
                        <a target="_blank" rel="noopener" href={`https://www.windy.com/?${date.toISOString().slice(0,10)}/${data.latitude},${data.longitude},12`} className="px-2 py-1 brutal-border-soft hover-paper font-mono text-[10px] uppercase tracking-wider text-center">WINDY</a>
                        <a target="_blank" rel="noopener" href={`https://open-meteo.com/en/docs#latitude=${data.latitude}&longitude=${data.longitude}`} className="px-2 py-1 brutal-border-soft hover-paper font-mono text-[10px] uppercase tracking-wider text-center">OPEN-METEO</a>
                        <a target="_blank" rel="noopener" href={`https://www.google.com/search?q=${encodeURIComponent(`météo ${data.place || ''} ${date.toLocaleDateString('fr-FR')}`)}`} className="px-2 py-1 brutal-border-soft hover-paper font-mono text-[10px] uppercase tracking-wider text-center">GOOGLE</a>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <footer className="px-4 py-2 brutal-border-soft border-t-[1.5px] bg-[var(--color-bg-soft)] flex justify-end">
              {sel > 0 && <button onClick={() => setOpenDay(sel - 1)} className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider brutal-border-soft hover-paper mr-2">‹ PREV</button>}
              {sel < d.time.length - 1 && <button onClick={() => setOpenDay(sel + 1)} className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider brutal-border-soft hover-paper">NEXT ›</button>}
            </footer>
          </div>
        </>
      )}
    </section>
  );
}
