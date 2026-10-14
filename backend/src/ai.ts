// Page IA. : état et pilotage de l'IA locale de deux machines (un PC de bureau avec un gros GPU, un serveur toujours allumé).
// Chaque machine expose un petit service d'état (GET /status, POST /llm/load|unload, POST /ai-mode) à côté d'un
// routeur llama.cpp compatible OpenAI. Sans URL configurée, la machine apparaît simplement « éteinte ».
const HOSTS = {
  pc: { url: process.env.AI_PC_STATUS_URL || '', key: process.env.AI_PC_KEY || '' },
  server: { url: process.env.AI_SERVER_STATUS_URL || '', key: process.env.AI_SERVER_KEY || '' },
};
export type AiHost = keyof typeof HOSTS;
export const isAiHost = (h: string): h is AiHost => h in HOSTS;

async function call(host: AiHost, path: string, body?: unknown, timeout = 4000) {
  const { url, key } = HOSTS[host];
  if (!url) throw new Error(`${host}: AI status URL not configured`);
  const r = await fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}

/** null = machine éteinte ou service injoignable */
export async function aiStatus() {
  const get = (h: AiHost) => call(h, '/status').then(r => (r.status === 200 ? r.body : null)).catch(() => null);
  const [pc, server] = await Promise.all([get('pc'), get('server')]);
  return { pc, server };
}

export const aiControl = (host: AiHost, path: string, body: unknown) => call(host, path, body, 30_000);

// Routeurs llama.cpp (API OpenAI) : la page IA. y discute sans exposer les clés au navigateur
const ROUTERS: Record<AiHost, string> = {
  pc: process.env.AI_PC_LLM_URL || '',
  server: process.env.AI_SERVER_LLM_URL || '',
};
// Modèle du PC qui ne tient en VRAM qu'en « mode IA » (le bureau libère sa VRAM) ; vide = pas de préparation
const BIG_MODEL = process.env.AI_PC_BIG_MODEL || '';
const BIG_MODEL_MIB = Number(process.env.AI_PC_BIG_MODEL_MIB || 13000);

/** Avant le 27B du PC : mode IA puis attente de la VRAM ; sinon llama.cpp en déporte une partie sur le CPU (PC lent) */
export async function prepareModel(host: AiHost, model: string) {
  if (host !== 'pc' || !BIG_MODEL || model !== BIG_MODEL) return;
  if ((await call('pc', '/status')).body?.ai_mode) return;
  await call('pc', '/ai-mode', { on: true });
  for (let i = 0; i < 20; i++) {
    await Bun.sleep(1000);
    const st = (await call('pc', '/status').catch(() => null))?.body;
    const g = st?.gpu;
    if (st?.ai_mode && g && g.vram_total_mib - g.vram_used_mib >= BIG_MODEL_MIB) return;
  }
}

export async function chatStream(host: AiHost, model: string, messages: unknown[]) {
  if (!ROUTERS[host]) throw new Error(`${host}: LLM router URL not configured`);
  await prepareModel(host, model);
  return fetch(`${ROUTERS[host]}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${HOSTS[host].key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, chat_template_kwargs: { enable_thinking: false } }),
    signal: AbortSignal.timeout(600_000),
  });
}
