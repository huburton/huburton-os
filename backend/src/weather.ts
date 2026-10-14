// Open-Meteo: free, no key. Location from the environment (default: Luxembourg City).
import { OFFLINE, TIME_ZONE } from './config.ts';

export const WEATHER_PLACE = process.env.WEATHER_PLACE || 'Luxembourg';
const LAT = Number(process.env.WEATHER_LAT || 49.6116);
const LON = Number(process.env.WEATHER_LON || 6.1319);
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset&timezone=${encodeURIComponent(TIME_ZONE)}&forecast_days=7`;

interface WeatherCache {
  data: any;
  expires: number;
}
let cache: WeatherCache | null = null;

export async function getWeather() {
  if (OFFLINE) throw new Error('weather disabled (OFFLINE=1)');
  if (cache && Date.now() < cache.expires) return cache.data;
  const r = await fetch(URL);
  if (!r.ok) throw new Error(`weather upstream HTTP ${r.status}`);
  const data = await r.json() as any;
  cache = { data, expires: Date.now() + 10 * 60 * 1000 }; // 10 min cache
  return data;
}

// WMO weather code → label + icon glyph
export const WEATHER_LABELS: Record<number, { fr: string; glyph: string }> = {
  0: { fr: 'Ciel clair', glyph: '○' },
  1: { fr: 'Surtout clair', glyph: '◔' },
  2: { fr: 'Partiellement nuageux', glyph: '◑' },
  3: { fr: 'Couvert', glyph: '●' },
  45: { fr: 'Brouillard', glyph: '≈' },
  48: { fr: 'Brouillard givrant', glyph: '≋' },
  51: { fr: 'Bruine légère', glyph: '⋮' },
  53: { fr: 'Bruine modérée', glyph: '⋮⋮' },
  55: { fr: 'Bruine dense', glyph: '⋮⋮⋮' },
  61: { fr: 'Pluie légère', glyph: '╲╲' },
  63: { fr: 'Pluie modérée', glyph: '╲╲╲' },
  65: { fr: 'Pluie forte', glyph: '▎▎▎' },
  71: { fr: 'Neige légère', glyph: '✻' },
  73: { fr: 'Neige modérée', glyph: '✻✻' },
  75: { fr: 'Neige forte', glyph: '✻✻✻' },
  80: { fr: 'Averse légère', glyph: '╲╲' },
  81: { fr: 'Averse modérée', glyph: '╲╲╲' },
  82: { fr: 'Averse violente', glyph: '▎▎▎' },
  95: { fr: 'Orage', glyph: '⚡' },
  96: { fr: 'Orage + grêle légère', glyph: '⚡▎' },
  99: { fr: 'Orage + grêle forte', glyph: '⚡▎▎' },
};
