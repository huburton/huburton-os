import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { streamSSE } from 'hono/streaming';
import { loadTasks, loadTask, loadProjects, createTask, updateTask, deleteTask, reorderTasks, type TaskSize } from './vault.ts';
import { loadMedia, loadIdeas } from './vault-media.ts';
import { createMedia, deleteMedia, updateMedia, enrichAll, enrichStatus } from './vault-media-write.ts';
import { loadCalEvents, createCalEvent, updateCalEvent, deleteCalEvent, bulkCreateCalEvents, patchEventFrontmatter } from './vault-calendar.ts';
import { getSystem } from './system.ts';
import { addEvent, getEvents, subscribe } from './events.ts';
import { getWeather, WEATHER_LABELS, WEATHER_PLACE } from './weather.ts';
import { getHealthchecks } from './healthcheck.ts';
import { notify } from './notify.ts';
import { findPoster } from './posters.ts';
import { generateBrief, getLatestBrief } from './morning-brief.ts';
import * as gcal from './google-calendar.ts';
import { loadProjectMetas, createProjectMeta, updateProjectMeta, deleteProjectMeta } from './vault-project.ts';
import { generate, AGENT_TOOLS, agentSystem, isConfigured as geminiConfigured, type GeminiContent } from './gemini.ts';
import { loadCalEvents as loadCalEventsForAgent } from './vault-calendar.ts';
import { aiControl, aiStatus, chatStream, isAiHost, prepareModel } from './ai.ts';
import { addKanbanIdea, loadKanbanIdeas } from './vault-ideas.ts';

const app = new Hono();
if (process.env.NODE_ENV !== 'test') app.use('*', logger());
// Same-origin in production (nginx proxies /api); CORS only matters for a separate dev front.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:4321').split(',').map(s => s.trim()).filter(Boolean);
app.use('/api/*', cors({ origin: CORS_ORIGINS, credentials: true }));

app.get('/api/health', (c) => c.json({
  ok: true, service: 'huburton-os-api', version: '0.8.0',
  uptime: process.uptime(), timestamp: Date.now(),
}));

// ----- TASKS
app.get('/api/tasks', async (c) => c.json({ tasks: await loadTasks() }));
app.get('/api/tasks/:id', async (c) => {
  const task = await loadTask(c.req.param('id'));
  if (!task) return c.json({ error: 'not found' }, 404);
  return c.json({ task });
});
app.post('/api/tasks', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.title || typeof body.title !== 'string') return c.json({ error: 'title required' }, 400);
  const validSizes: TaskSize[] = ['small', 'medium', 'big'];
  const size = validSizes.includes(body.size) ? body.size : 'small';
  const task = await createTask({
    title: body.title.trim(), size,
    tags: Array.isArray(body.tags) ? body.tags : [],
    project: body.project, body: body.body,
  });
  addEvent({
    source: 'plateforme', kind: 'capture', level: 'ok',
    title: `+ ${task.size.toUpperCase()} · ${task.title}`,
    detail: task.project ? `→ ${task.project}` : undefined,
  });
  return c.json({ task }, 201);
});
app.patch('/api/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const validSizes: TaskSize[] = ['small', 'medium', 'big'];
  const patch: any = {};
  if (typeof body.done === 'boolean') patch.done = body.done;
  if (typeof body.size === 'string' && validSizes.includes(body.size)) patch.size = body.size;
  if (Array.isArray(body.tags)) patch.tags = body.tags;
  if (body.project !== undefined) patch.project = body.project === '' ? null : body.project;
  if (typeof body.title === 'string') patch.title = body.title;
  if (typeof body.body === 'string') patch.body = body.body;
  if (typeof body.order === 'number') patch.order = body.order;
  const updated = await updateTask(id, patch);
  if (!updated) return c.json({ error: 'not found' }, 404);
  if (patch.done !== undefined) {
    addEvent({
      source: 'plateforme', kind: patch.done ? 'task-done' : 'task-reopen',
      level: patch.done ? 'ok' : 'info',
      title: `${patch.done ? '✓' : '↺'} ${updated.title}`,
      detail: updated.project ? `→ ${updated.project}` : undefined,
    });
  }
  return c.json({ task: updated });
});
app.post('/api/tasks/reorder', async (c) => {
  // body: { items: [{id, order, size?}, ...] }
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.items)) return c.json({ error: 'items[] required' }, 400);
  await reorderTasks(body.items);
  return c.json({ ok: true });
});
app.delete('/api/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const task = await loadTask(id);
  const ok = await deleteTask(id);
  if (!ok) return c.json({ error: 'not found' }, 404);
  if (task) addEvent({ source: 'plateforme', kind: 'task-delete', level: 'warn', title: `× ${task.title}` });
  return c.json({ ok: true });
});

app.get('/api/projects', async (c) => c.json({ projects: await loadProjects() }));
app.get('/api/system', async (c) => {
  try { return c.json(await getSystem()); }
  catch (err) { return c.json({ error: (err as Error).message }, 500); }
});
app.get('/api/media', async (c) => c.json({ media: await loadMedia() }));
app.post('/api/media', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.titre || !body.categorie) return c.json({ error: 'titre, categorie required' }, 400);
  const m = await createMedia(body);
  if ('exists' in m) return c.json({ media: m, exists: true });
  addEvent({ source: 'plateforme', kind: 'media-add', level: 'ok', title: `+ ${m.categorie}: ${m.titre}` });
  return c.json({ media: m }, 201);
});
// Enrichissement TMDB en lot (genres, sagas, durées, notes TMDB) : POST lance, GET suit l'avancement.
app.post('/api/media/enrich', async (c) => {
  enrichAll(c.req.query('force') === '1').catch(() => {});
  return c.json(enrichStatus);
});
app.get('/api/media/enrich', (c) => c.json(enrichStatus));
// Tous les films d'une saga TMDB, avec ceux déjà présents dans le vault.
app.get('/api/media/saga/:id', async (c) => {
  const { tmdbCollection } = await import('./posters.ts');
  const col = await tmdbCollection(c.req.param('id'));
  if (!col) return c.json({ error: 'not found' }, 404);
  const mine = new Map((await loadMedia()).filter(m => m.external_source === 'tmdb' && m.categorie === 'film').map(m => [m.external_id, m]));
  return c.json({ name: col.name, parts: col.parts.map(p => {
    const m = mine.get(p.externalId);
    return { ...p, id: m?.id, statut: m?.statut, note: m?.note };
  }) });
});
app.delete('/api/media/:id', async (c) => {
  const ok = await deleteMedia(c.req.param('id'));
  if (!ok) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});
app.patch('/api/media/:id', async (c) => {
  const ok = await updateMedia(c.req.param('id'), await c.req.json().catch(() => ({})));
  if (!ok) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});
// Search live TMDB (movie/tv) ou Google Books (book) → liste de hits avec poster pour ajout one-click.
app.get('/api/media/search', async (c) => {
  const q = c.req.query('q') || '';
  const type = (c.req.query('type') || 'movie') as 'movie' | 'tv' | 'book';
  if (!q.trim()) return c.json({ hits: [] });
  const { searchAny } = await import('./posters.ts');
  const hits = await searchAny(q, type);
  return c.json({ hits });
});
// Détails TMDB : trailer + backdrop HQ + imdb (pour Stremio). À appeler à l'ouverture d'un détail média.
app.get('/api/media/details', async (c) => {
  const kind = c.req.query('kind') as 'movie' | 'tv';
  const id = c.req.query('id');
  if (!kind || !id) return c.json({ error: 'kind and id required' }, 400);
  const { tmdbDetails } = await import('./posters.ts');
  const d = await tmdbDetails(kind, id);
  if (!d) return c.json({ error: 'not found' }, 404);
  return c.json(d);
});
app.get('/api/ideas', async (c) => c.json({ ideas: [...await loadKanbanIdeas(), ...await loadIdeas()] }));
app.post('/api/ideas', async (c) => {
  const { title } = await c.req.json().catch(() => ({}));
  if (typeof title !== 'string' || !title.trim() || title.length > 300) return c.json({ ok: false, error: 'titre requis' }, 400);
  try {
    await addKanbanIdea(title);
    addEvent({ source: 'plateforme', kind: 'capture', level: 'ok', title: 'Idée ajoutée', detail: title.trim() });
    return c.json({ ok: true });
  } catch (e) { return c.json({ ok: false, error: (e as Error).message }, 500); }
});

// ----- AI (page IA.) : local LLM hosts (desktop + server), model load/unload, chat
app.get('/api/ai', async (c) => c.json(await aiStatus()));
app.post('/api/ai/:host/llm/:action', async (c) => {
  const { host, action } = c.req.param();
  const { model } = await c.req.json().catch(() => ({}));
  if (!isAiHost(host) || !['load', 'unload'].includes(action) || typeof model !== 'string' || !/^[\w.-]+$/.test(model)) {
    return c.json({ ok: false, error: 'hôte, action ou modèle invalide' }, 400);
  }
  try {
    if (action === 'load') await prepareModel(host, model);
    const { status, body } = await aiControl(host, `/llm/${action}`, { model });
    addEvent({ source: 'ia', kind: 'control', level: status === 200 ? 'info' : 'warn',
      title: `${model} ${action === 'load' ? 'chargé' : 'déchargé'}`, detail: host === 'pc' ? 'PC' : 'serveur' });
    return c.json(body, status as 200);
  } catch { return c.json({ ok: false, error: `${host} injoignable` }, 502); }
});
// Chat avec un modèle local (réponse en flux SSE du routeur llama.cpp, relayée telle quelle)
app.post('/api/ai/chat', async (c) => {
  const { host, model, messages } = await c.req.json().catch(() => ({}));
  if (!isAiHost(host) || typeof model !== 'string' || !/^[\w.-]+$/.test(model) || !Array.isArray(messages)) {
    return c.json({ error: 'requête invalide' }, 400);
  }
  try {
    const up = await chatStream(host, model, messages.slice(-30));
    if (!up.ok || !up.body) return c.json({ error: `modèle indisponible (HTTP ${up.status})` }, 502);
    return new Response(up.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  } catch { return c.json({ error: `${host === 'pc' ? 'PC' : 'serveur'} injoignable` }, 502); }
});
app.post('/api/ai/pc/ai-mode', async (c) => {
  const { on } = await c.req.json().catch(() => ({}));
  try {
    const { status, body } = await aiControl('pc', '/ai-mode', { on: !!on });
    addEvent({ source: 'ia', kind: 'control', level: 'info', title: `Mode IA ${on ? 'activé' : 'désactivé'}`, detail: 'PC' });
    return c.json(body, status as 202);
  } catch { return c.json({ ok: false, error: 'PC injoignable' }, 502); }
});

// ----- WEATHER
app.get('/api/weather', async (c) => {
  try {
    const data = await getWeather();
    return c.json({ ...data, place: WEATHER_PLACE, labels: WEATHER_LABELS });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ----- CALENDAR EVENTS (≠ activity stream)
app.get('/api/calendar', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const events = await loadCalEvents(from, to);
  return c.json({ events });
});
app.post('/api/calendar', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.title || !body.start) return c.json({ error: 'title and start required' }, 400);
  const event = await createCalEvent(body);
  addEvent({ source: 'plateforme', kind: 'cal-add', level: 'info', title: `CAL + ${event.title}`, detail: event.start });
  // VAULT → GOOGLE : push si connecté (skip si déjà google-sourced)
  if (!event.googleEventId) {
    try {
      const gid = await gcal.pushEvent({
        title: event.title, start: event.start, end: event.end,
        allDay: event.allDay, location: event.location, description: event.description,
      });
      if (gid) {
        await patchEventFrontmatter(event.id, { googleEventId: gid });
        event.googleEventId = gid;
      }
    } catch (e) { /* token absent ou erreur réseau : on ignore, l'event local existe */ }
  }
  return c.json({ event }, 201);
});
app.post('/api/calendar/bulk', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.events)) return c.json({ error: 'events[] required' }, 400);
  const created = await bulkCreateCalEvents(body.events);
  addEvent({ source: 'plateforme', kind: 'cal-bulk', level: 'ok', title: `CAL + ${created.length} events ajoutés en lot` });
  return c.json({ created: created.length, events: created }, 201);
});
app.patch('/api/calendar/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const updated = await updateCalEvent(id, body);
  if (!updated) return c.json({ error: 'not found' }, 404);
  // Propager sur Google si l'event est lié. Champs vidés envoyés vides (undefined = Google garde l'ancien) ;
  // sans fin → fin = début comme pushEvent (sinon l'ancienne fin reste, début > fin : Google refuse)
  if (updated.googleEventId) {
    try {
      await gcal.updateRemoteEvent(updated.googleEventId, {
        title: updated.title, start: updated.start, end: updated.end || updated.start,
        allDay: updated.allDay, location: updated.location ?? '', description: updated.description ?? '',
      });
    } catch {}
  }
  return c.json({ event: updated });
});
app.delete('/api/calendar/:id', async (c) => {
  const id = c.req.param('id');
  // Récup l'event AVANT suppression pour avoir le googleEventId
  const events = await loadCalEvents();
  const evt = events.find(e => e.id === id);
  if (evt?.googleEventId) {
    try { await gcal.deleteRemoteEvent(evt.googleEventId); } catch {}
  }
  const ok = await deleteCalEvent(id);
  if (!ok) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// ----- ACTIVITY STREAM
app.post('/api/events', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.source || !body.kind || !body.title) return c.json({ error: 'source/kind/title required' }, 400);
  const evt = addEvent({
    source: String(body.source), kind: String(body.kind),
    title: String(body.title),
    detail: body.detail ? String(body.detail) : undefined,
    level: ['info', 'ok', 'warn', 'err'].includes(body.level) ? body.level : 'info',
  });
  return c.json({ event: evt }, 201);
});
app.get('/api/events', (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  return c.json({ events: getEvents(limit) });
});
app.get('/api/events/stream', (c) => {
  return streamSSE(c, async (stream) => {
    let kept = true;
    const unsub = subscribe(async (e) => { if (kept) await stream.writeSSE({ data: JSON.stringify(e), event: 'event' }); });
    for (const e of getEvents(20).reverse()) await stream.writeSSE({ data: JSON.stringify(e), event: 'event' });
    while (kept) { await stream.writeSSE({ data: 'ping', event: 'ping' }); await new Promise(r => setTimeout(r, 15000)); }
    unsub();
  });
});

app.get('/api/healthchecks', async (c) => {
  const results = await getHealthchecks();
  return c.json({ checks: results });
});

app.get('/api/project-metas', async (c) => c.json({ metas: await loadProjectMetas() }));
app.post('/api/project-metas', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) return c.json({ error: 'name required' }, 400);
  const meta = await createProjectMeta(body);
  return c.json({ meta }, 201);
});
app.patch('/api/project-metas/:id', async (c) => {
  const updated = await updateProjectMeta(c.req.param('id'), await c.req.json().catch(() => ({})));
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json({ meta: updated });
});
app.delete('/api/project-metas/:id', async (c) => {
  const ok = await deleteProjectMeta(c.req.param('id'));
  if (!ok) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});


// ----- AGENT (Gemini function-calling)
app.get('/api/agent/status', (c) => c.json({ ok: geminiConfigured() }));
app.post('/api/agent', async (c) => {
  if (!geminiConfigured()) return c.json({ error: 'gemini not configured (GEMINI_API_KEY missing)' }, 503);
  const body = await c.req.json().catch(() => ({}));
  if (!body.prompt || typeof body.prompt !== 'string') return c.json({ error: 'prompt required' }, 400);

  let history: GeminiContent[] = Array.isArray(body.history) ? body.history : [];
  history.push({ role: 'user', parts: [{ text: body.prompt }] });

  // Boucle function-calling. 20 itérations = OK pour workflows multi-tâches (ex : décaler toute une semaine d'events).
  for (let i = 0; i < 20; i++) {
    const r = await generate(history, AGENT_TOOLS, agentSystem());
    if (r.error) return c.json({ error: r.error.message, code: r.error.code }, 500);
    const cand = r.candidates?.[0];
    if (!cand) return c.json({ error: 'no candidate' }, 500);
    history.push(cand.content as GeminiContent);

    // Cherche un function call
    const fc = cand.content.parts.find(p => p.functionCall);
    if (!fc || !fc.functionCall) {
      // Pas d'appel d'outil = réponse finale
      const text = cand.content.parts.map(p => p.text || '').join('\n').trim();
      addEvent({ source: 'gemini', kind: 'agent-reply', level: 'info', title: text.slice(0, 80), detail: body.prompt.slice(0, 80) });
      return c.json({ reply: text, history });
    }

    // Exécuter le call
    const { name, args } = fc.functionCall;
    let result: any = { ok: false };
    try {
      const calMod = await import('./vault-calendar.ts');
      const mediaMod = await import('./vault-media-write.ts');

      async function resolveTaskId(idOrTitle: string): Promise<string | null> {
        const all = await loadTasks();
        const direct = all.find(t => t.id === idOrTitle);
        if (direct) return direct.id;
        const lower = idOrTitle.toLowerCase();
        const match = all.find(t => t.title.toLowerCase().includes(lower));
        return match ? match.id : null;
      }

      if (name === 'create_task') {
        const task = await createTask({ title: String(args.title), size: args.size, tags: args.tags, project: args.project });
        addEvent({ source: 'gemini', kind: 'tool-create-task', level: 'ok', title: `+ ${task.title}`, detail: `size=${task.size}` });
        result = { task };
      } else if (name === 'list_tasks') {
        const all = await loadTasks();
        let filtered = all;
        if (typeof args.done === 'boolean') filtered = filtered.filter(t => t.done === args.done);
        if (args.project) filtered = filtered.filter(t => t.project === String(args.project).toUpperCase());
        if (args.query) filtered = filtered.filter(t => t.title.toLowerCase().includes(String(args.query).toLowerCase()));
        result = { count: filtered.length, tasks: filtered.slice(0, 50).map(t => ({ id: t.id, title: t.title, size: t.size, done: t.done, project: t.project, tags: t.tags })) };
      } else if (name === 'update_task') {
        const id = await resolveTaskId(String(args.id));
        if (!id) { result = { error: 'task not found' }; }
        else {
          const patch: any = {};
          if (typeof args.done === 'boolean') patch.done = args.done;
          if (args.size) patch.size = args.size;
          if (args.title) patch.title = args.title;
          if (args.project !== undefined) patch.project = args.project;
          const updated = await updateTask(id, patch);
          if (updated) addEvent({ source: 'gemini', kind: 'tool-update-task', level: 'info', title: `~ ${updated.title}`, detail: JSON.stringify(patch) });
          result = { task: updated };
        }
      } else if (name === 'delete_task') {
        const id = await resolveTaskId(String(args.id));
        if (!id) { result = { error: 'task not found' }; }
        else {
          const task = await loadTask(id);
          await deleteTask(id);
          if (task) addEvent({ source: 'gemini', kind: 'tool-delete-task', level: 'warn', title: `× ${task.title}` });
          result = { ok: true, deleted: id };
        }
      } else if (name === 'create_event') {
        const ev = await calMod.createCalEvent({
          title: String(args.title), start: String(args.start), end: args.end, allDay: args.allDay,
          project: args.project, color: args.color, location: args.location,
        });
        addEvent({ source: 'gemini', kind: 'tool-create-event', level: 'ok', title: `CAL + ${ev.title}`, detail: ev.start });
        result = { event: ev };
      } else if (name === 'list_events') {
        const evs = await loadCalEventsForAgent(args.from, args.to);
        result = { count: evs.length, events: evs.slice(0, 30) };
      } else if (name === 'delete_event') {
        const ok = await calMod.deleteCalEvent(String(args.id));
        if (ok) addEvent({ source: 'gemini', kind: 'tool-delete-event', level: 'warn', title: `× event ${args.id}` });
        result = { ok };
      } else if (name === 'bulk_delete_events') {
        // Supprime tous les events qui matchent les filtres (from/to obligatoires, project/title_contains optionnels)
        const from = String(args.from);
        const to = String(args.to);
        const projectFilter = args.project ? String(args.project).toUpperCase() : undefined;
        const titleFilter = args.title_contains ? String(args.title_contains).toLowerCase() : undefined;
        const evs = await loadCalEventsForAgent(from, to);
        const toDelete = evs.filter(e => {
          if (projectFilter && e.project !== projectFilter) return false;
          if (titleFilter && !e.title.toLowerCase().includes(titleFilter)) return false;
          return true;
        });
        let removed = 0;
        const removedTitles: string[] = [];
        for (const e of toDelete) {
          if ((e as any).googleEventId) {
            try { await gcal.deleteRemoteEvent((e as any).googleEventId); } catch {}
          }
          if (await calMod.deleteCalEvent(e.id)) {
            removed++;
            removedTitles.push(`${e.title} (${e.start.slice(0,10)})`);
          }
        }
        if (removed > 0) addEvent({ source: 'gemini', kind: 'tool-bulk-delete', level: 'warn',
          title: `× ${removed} events supprimés`, detail: `${from} → ${to}${projectFilter ? ' @'+projectFilter : ''}${titleFilter ? ' "'+titleFilter+'"' : ''}` });
        result = { removed, events: removedTitles };
      } else if (name === 'bulk_create_events') {
        // Crée plusieurs events d'un coup (utile pour seeder une période)
        const events = Array.isArray(args.events) ? args.events : [];
        const created: string[] = [];
        for (const ev of events) {
          if (!ev.title || !ev.start) continue;
          const e = await calMod.createCalEvent({
            title: String(ev.title), start: String(ev.start), end: ev.end,
            allDay: ev.allDay, project: ev.project, color: ev.color, location: ev.location, description: ev.description,
          });
          created.push(`${e.title} (${e.start.slice(0,10)})`);
          // Push Google si connecté
          try {
            const gid = await gcal.pushEvent({
              title: e.title, start: e.start, end: e.end, allDay: e.allDay,
              location: e.location, description: e.description,
            });
            if (gid) await patchEventFrontmatter(e.id, { googleEventId: gid });
          } catch {}
        }
        if (created.length) addEvent({ source: 'gemini', kind: 'tool-bulk-create', level: 'ok',
          title: `+ ${created.length} events créés` });
        result = { created: created.length, events: created };
      } else if (name === 'create_media') {
        const m = await mediaMod.createMedia({
          titre: String(args.titre),
          categorie: String(args.categorie),
          auteur: args.auteur, annee: args.annee, genre: args.genre,
          note: args.note, statut: args.statut, plateforme: args.plateforme,
          recommande_par: args.recommande_par, image_url: args.image_url,
        });
        addEvent({ source: 'gemini', kind: 'tool-create-media', level: 'ok', title: `+ ${m.categorie}: ${m.titre}` });
        result = { media: m };
      } else if (name === 'list_media') {
        const all = await loadMedia();
        let filtered = all;
        if (args.categorie) filtered = filtered.filter(m => m.categorie === args.categorie);
        if (args.statut) filtered = filtered.filter(m => m.statut === args.statut);
        result = { count: filtered.length, media: filtered.slice(0, 50) };
      } else if (name === 'send_notification') {
        const ok = await notify({ title: String(args.title), message: args.message, priority: args.priority, tags: args.tags });
        result = { ok };
      } else if (name === 'list_projects') {
        const [counts, metas] = await Promise.all([loadProjects(), loadProjectMetas()]);
        result = { counts, metas };
      } else {
        result = { error: 'unknown tool: ' + name };
      }
    } catch (err) {
      result = { error: (err as Error).message };
    }

    history.push({
      role: 'function',
      parts: [{ functionResponse: { name, response: result } }],
    });
  }

  return c.json({ error: 'max iterations reached' }, 500);
});

app.post('/api/notify', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.title) return c.json({ error: 'title required' }, 400);
  const ok = await notify(body);
  if (ok) addEvent({ source: 'plateforme', kind: 'notify', level: 'info', title: `NOTIF · ${body.title}`, detail: body.message?.slice(0, 80) });
  return c.json({ ok });
});
app.post('/api/notify/test', async (c) => {
  const { notifyTest } = await import('./notify.ts');
  const ok = await notifyTest();
  return c.json({ ok, hint: ok ? 'Notification sent.' : 'Failed: ntfy not configured or unreachable.' });
});


app.get('/api/poster', async (c) => {
  const title = c.req.query('title');
  const categorie = c.req.query('categorie') || 'film';
  if (!title) return c.json({ error: 'title required' }, 400);
  const p = await findPoster(title, categorie);
  return c.json(p);
});


app.get('/api/brief', async (c) => {
  const b = await getLatestBrief();
  if (!b) return c.json({ blocks: [], date: null });
  return c.json(b);
});
app.post('/api/brief/generate', async (c) => {
  const r = await generateBrief();
  if (r.error) return c.json({ error: r.error }, 500);
  return c.json({ blocks: r.blocks, raw: r.raw, filePath: r.filePath });
});

// ----- GOOGLE CALENDAR
app.get('/api/google/status', async (c) => c.json(await gcal.status()));
app.get('/api/google/auth', (c) => {
  if (!gcal.isConfigured()) return c.text('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing (see .env.example)', 503);
  return c.redirect(gcal.authorizeUrl());
});
app.get('/api/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('Missing ?code', 400);
  const t = await gcal.exchangeCode(code);
  if (!t) return c.text('Token exchange failed', 500);
  // sync immédiat après auth
  const r = await gcal.syncEvents(60);
  return c.html(`<html><body style="background:#0E0E0C;color:#F2EDE3;font-family:monospace;padding:48px;text-align:center;"><h1 style="font-family:serif;font-size:64px;">Google Calendar connecté</h1><p>Token sauvegardé. ${r.imported} events importés, ${r.updated} mis à jour.</p><a href="/planning" style="color:#26517B;">→ Voir le planning</a></body></html>`);
});
app.post('/api/google/sync', async (c) => {
  const days = parseInt(c.req.query('days') || '60', 10);
  const r = await gcal.syncEvents(days);
  addEvent({ source: 'plateforme', kind: 'gcal-sync', level: r.errors.length ? 'warn' : 'ok',
    title: `GCAL sync : +${r.imported} new, ~${r.updated} updated, -${r.deleted} deleted`,
    detail: r.errors.length ? `${r.errors.length} errors` : undefined });
  return c.json(r);
});
app.post('/api/google/disconnect', async (c) => {
  await gcal.disconnect();
  return c.json({ ok: true });
});
// Push tous les events vault qui n'ont pas encore de googleEventId (sauf ceux marqués @GCAL).
app.post('/api/google/push-all', async (c) => {
  const events = await loadCalEvents();
  let pushed = 0, skipped = 0;
  const errors: string[] = [];
  for (const e of events) {
    if (e.googleEventId || e.project === 'GCAL') { skipped++; continue; }
    try {
      const gid = await gcal.pushEvent({
        title: e.title, start: e.start, end: e.end,
        allDay: e.allDay, location: e.location, description: e.description,
      });
      if (gid) {
        await patchEventFrontmatter(e.id, { googleEventId: gid });
        pushed++;
      } else { skipped++; }
    } catch (err) { errors.push((err as Error).message); }
  }
  addEvent({ source: 'plateforme', kind: 'gcal-push-all', level: 'ok',
    title: `GCAL push : +${pushed} events (${skipped} skipped)` });
  return c.json({ pushed, skipped, errors });
});

export default app;
