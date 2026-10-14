const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiPart { text?: string; functionCall?: { name: string; args: any }; functionResponse?: { name: string; response: any }; }
export interface GeminiContent { role: 'user' | 'model' | 'function'; parts: GeminiPart[]; }
export interface GeminiTool { functionDeclarations: Array<{ name: string; description: string; parameters: any }>; }

export interface GeminiResponse {
  candidates?: Array<{
    content: { role: string; parts: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: any;
  error?: { code: number; message: string };
}

export function isConfigured() {
  return !!API_KEY;
}

// Retry transitoire : 503 (UNAVAILABLE), 429 (rate-limited), 500. Backoff exponentiel court.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function generate(contents: GeminiContent[], tools?: GeminiTool[], systemInstruction?: string): Promise<GeminiResponse> {
  if (!API_KEY) throw new Error('GEMINI_API_KEY missing — write it in .env.local');
  const body: any = { contents };
  if (tools && tools.length) body.tools = tools;
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  body.generationConfig = { temperature: 0.4, maxOutputTokens: 4096 };

  let lastErr: { code: number; message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let r: Response;
    try {
      r = await fetch(`${BASE}/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = { code: 0, message: `network: ${(e as Error).message}` };
      if (attempt < 2) { await sleep(700 * (attempt + 1)); continue; }
      return { error: lastErr };
    }

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      lastErr = { code: r.status, message: text.slice(0, 400) || `HTTP ${r.status}` };
      if (RETRY_STATUS.has(r.status) && attempt < 2) {
        const delay = 800 * Math.pow(2, attempt); // 800, 1600
        console.warn(`[gemini] ${r.status} — retry in ${delay}ms (attempt ${attempt + 1}/3)`);
        await sleep(delay);
        continue;
      }
      return { error: lastErr };
    }

    // Réponse OK : parsing safe
    let raw = '';
    try { raw = await r.text(); } catch (e) {
      lastErr = { code: 0, message: `read body failed: ${(e as Error).message}` };
      return { error: lastErr };
    }
    try {
      return JSON.parse(raw) as GeminiResponse;
    } catch (e) {
      lastErr = { code: 0, message: `non-JSON response: ${raw.slice(0, 200)}` };
      console.warn('[gemini] non-JSON body', raw.slice(0, 200));
      // pas de retry sur parse failure
      return { error: lastErr };
    }
  }
  return { error: lastErr || { code: 0, message: 'unknown error' } };
}

// Tools exposés à Gemini — il peut les appeler pour modifier le vault
export const AGENT_TOOLS: GeminiTool[] = [{
  functionDeclarations: [
    {
      name: 'create_task',
      description: "Crée une nouvelle tâche.",
      parameters: { type: 'object', properties: {
        title: { type: 'string' },
        size: { type: 'string', enum: ['small','medium','big'], description: 'small (rapide), medium (~heure), big (projet)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags uppercase: CODE, MONEY, MOVE, CALL, BUY, RECURRING, IDEA' },
        project: { type: 'string', description: 'Projet associé, uppercase' },
      }, required: ['title'] },
    },
    {
      name: 'list_tasks',
      description: "Liste les tâches existantes (avec leur ID).",
      parameters: { type: 'object', properties: {
        done: { type: 'boolean' },
        project: { type: 'string' },
        query: { type: 'string', description: 'Substring du titre pour filtrer' },
      } },
    },
    {
      name: 'update_task',
      description: "Modifie une tâche (mark done, change size/title/project). Utilise list_tasks d'abord pour trouver l'ID si nécessaire.",
      parameters: { type: 'object', properties: {
        id: { type: 'string', description: 'ID de la tâche OU substring du titre pour matcher' },
        done: { type: 'boolean' },
        size: { type: 'string', enum: ['small','medium','big'] },
        title: { type: 'string' },
        project: { type: 'string' },
      }, required: ['id'] },
    },
    {
      name: 'delete_task',
      description: "Supprime une tâche.",
      parameters: { type: 'object', properties: {
        id: { type: 'string', description: 'ID OU substring du titre' },
      }, required: ['id'] },
    },
    {
      name: 'create_event',
      description: "Crée un événement calendrier.",
      parameters: { type: 'object', properties: {
        title: { type: 'string' },
        start: { type: 'string', description: 'ISO datetime ex 2026-06-20T14:00:00' },
        end: { type: 'string', description: 'ISO datetime fin (optionnel)' },
        allDay: { type: 'boolean' },
        project: { type: 'string' },
        color: { type: 'string', enum: ['red','green','orange','yellow','blue','violet','fg'] },
        location: { type: 'string' },
      }, required: ['title', 'start'] },
    },
    {
      name: 'list_events',
      description: "Liste les événements calendrier sur une période.",
      parameters: { type: 'object', properties: {
        from: { type: 'string', description: 'ISO date début' },
        to: { type: 'string', description: 'ISO date fin' },
      }, required: ['from', 'to'] },
    },
    {
      name: 'delete_event',
      description: "Supprime UN événement calendrier (par ID). Pour supprimer plusieurs events à la fois, utilise bulk_delete_events qui est BEAUCOUP plus efficace.",
      parameters: { type: 'object', properties: {
        id: { type: 'string' },
      }, required: ['id'] },
    },
    {
      name: 'bulk_delete_events',
      description: "Supprime TOUS les events qui matchent dans une période. À PRIVILÉGIER quand l'user dit 'enlève tous mes rendez-vous du 6 au 12 juillet' ou 'supprime mes events de cette semaine'. Évite de boucler sur delete_event un par un. Propage la suppression sur Google Calendar si connecté.",
      parameters: { type: 'object', properties: {
        from: { type: 'string', description: 'ISO date début (YYYY-MM-DD ou ISO datetime)' },
        to: { type: 'string', description: 'ISO date fin' },
        project: { type: 'string', description: 'Filtre par projet (uppercase) : GCAL pour les events importés de Google, sinon le nom du projet' },
        title_contains: { type: 'string', description: 'Filtre par substring du titre (case insensitive)' },
      }, required: ['from', 'to'] },
    },
    {
      name: 'bulk_create_events',
      description: "Crée plusieurs events d'un coup. À PRIVILÉGIER pour seeder une période entière (ex: 'bloque 9h-12h du 13 au 15 juillet pour le projet X'). Push aussi sur Google Calendar si connecté.",
      parameters: { type: 'object', properties: {
        events: {
          type: 'array',
          items: { type: 'object', properties: {
            title: { type: 'string' },
            start: { type: 'string' },
            end: { type: 'string' },
            allDay: { type: 'boolean' },
            project: { type: 'string' },
            color: { type: 'string' },
            location: { type: 'string' },
            description: { type: 'string' },
          }, required: ['title', 'start'] },
        },
      }, required: ['events'] },
    },
    {
      name: 'create_media',
      description: "Ajoute un média à la médiathèque (film, série, livre, jeu, podcast, musique). Si l'user mentionne une note (ex: 5/5, 9/10), convertis en /10.",
      parameters: { type: 'object', properties: {
        titre: { type: 'string' },
        categorie: { type: 'string', enum: ['film','série','livre','jeu','podcast','musique','autre'] },
        auteur: { type: 'string', description: 'Réalisateur/auteur/artiste/dev' },
        annee: { type: 'number' },
        genre: { type: 'array', items: { type: 'string' } },
        note: { type: 'number', description: 'Note sur 10' },
        statut: { type: 'string', enum: ['à-voir','en-cours','vu','abandonné'] },
        plateforme: { type: 'string', description: 'Netflix, Steam, Apple TV+, Spotify, etc.' },
        recommande_par: { type: 'string' },
        image_url: { type: 'string', description: 'URL de la jaquette si connue' },
      }, required: ['titre', 'categorie'] },
    },
    {
      name: 'list_media',
      description: "Liste les médias de la médiathèque.",
      parameters: { type: 'object', properties: {
        categorie: { type: 'string' },
        statut: { type: 'string' },
      } },
    },
    {
      name: 'send_notification',
      description: "Envoie une notification push (téléphone + browser + windows). Utile pour rappels urgents.",
      parameters: { type: 'object', properties: {
        title: { type: 'string' },
        message: { type: 'string' },
        priority: { type: 'number', description: '1=min, 3=normal, 5=urgent' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Emojis tags ntfy ex: warning, rotating_light, calendar' },
      }, required: ['title'] },
    },
    {
      name: 'list_projects',
      description: "Liste les projets actifs avec leur état (tâches, deadline, milestones).",
      parameters: { type: 'object', properties: {} },
    },
  ],
}];

// Built per request so the date reference is always today's (a module-level constant froze it at boot).
export function agentSystem(now = new Date()): string {
  const owner = process.env.AGENT_OWNER_NAME || 'the user';
  return `You are the assistant built into huburton/os, the personal dashboard of ${owner}.
The dashboard stores tasks, calendar events, projects and media as Markdown notes in an Obsidian vault;
you read and change them only through the tools below.

# Tools
- Act directly through the tools. Do not ask for confirmation for reversible actions.
- For several events at once, ALWAYS prefer bulk_delete_events / bulk_create_events over looping on
  delete_event / create_event (the tool loop is capped at 20 iterations).
- To change existing items, call list_events or list_tasks first to get their IDs.
- Answer in the user's language, concise, no emoji. Confirm what you did in one or two factual sentences.

# Dates
Today = ${now.toISOString().slice(0, 10)}. Default year = ${now.getFullYear()}.
A month named without a year means ${now.getFullYear()}.`;
}
