interface Service {
  name: string;
  url: string;
  expected?: number; // expected status (default 200..399)
  internal?: boolean; // skip external check, just docker container check
  container?: string; // docker container name to match
}

// HEALTHCHECK_SERVICES="Gitea=https://git.example.com,Nextcloud=https://cloud.example.com"
const SERVICES: Service[] = (process.env.HEALTHCHECK_SERVICES || '')
  .split(',').map(s => s.trim()).filter(Boolean)
  .map(pair => { const i = pair.indexOf('='); return { name: pair.slice(0, i), url: pair.slice(i + 1) }; })
  .filter(s => s.name && /^https?:\/\//.test(s.url));

export interface HealthResult {
  name: string; url: string; status: number; ok: boolean; ms: number; error?: string;
}

const cache = new Map<string, { ts: number; result: HealthResult }>();
const TTL = 60 * 1000;

async function ping(s: Service): Promise<HealthResult> {
  const cached = cache.get(s.url);
  if (cached && Date.now() - cached.ts < TTL) return cached.result;

  const t0 = Date.now();
  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 4000);
    const r = await fetch(s.url, { method: 'GET', redirect: 'manual', signal: ac.signal });
    clearTimeout(timeout);
    const ms = Date.now() - t0;
    // an auth proxy may answer 302 or 401: anything below 500 means the service is up
    const ok = r.status >= 200 && r.status < 500;
    const result: HealthResult = { name: s.name, url: s.url, status: r.status, ok, ms };
    cache.set(s.url, { ts: Date.now(), result });
    return result;
  } catch (e) {
    const result: HealthResult = { name: s.name, url: s.url, status: 0, ok: false, ms: Date.now() - t0, error: (e as Error).message };
    cache.set(s.url, { ts: Date.now(), result });
    return result;
  }
}

export async function getHealthchecks(): Promise<HealthResult[]> {
  return Promise.all(SERVICES.map(ping));
}
