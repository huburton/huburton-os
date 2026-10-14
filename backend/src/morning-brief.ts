import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadTasks, loadProjects } from './vault.ts';
import { loadProjectMetas } from './vault-project.ts';
import { loadCalEvents } from './vault-calendar.ts';
import { loadIdeas } from './vault-media.ts';
import { generate, isConfigured } from './gemini.ts';
import { notify } from './notify.ts';
import { PUBLIC_URL, TIME_ZONE, VAULT_ROOT } from './config.ts';
import { localYmd } from './dates.ts';

const BRIEFS_DIR = join(VAULT_ROOT, '00-inbox', 'briefs');

// local date, not toISOString(): after midnight local time the UTC date is still yesterday
const ymd = (d = new Date()) => localYmd(d);

export interface BriefBlock { section: string; body: string; }

/** Splits an LLM brief into "⌘ SECTION" blocks; text without any section marker becomes a single BRIEF block. */
export function parseBrief(text: string): BriefBlock[] {
  const blocks: BriefBlock[] = [];
  for (const s of text.split(/(?=⌘\s+[A-ZÉÈÊÀÂÔÙÛ\s]+)/g)) {
    const m = s.match(/^⌘\s+([A-ZÉÈÊÀÂÔÙÛ\s]+)\n([\s\S]*)/);
    if (m) blocks.push({ section: m[1].trim(), body: m[2].trim() });
  }
  if (blocks.length === 0 && text.trim()) blocks.push({ section: 'BRIEF', body: text.trim() });
  return blocks;
}

export async function generateBrief(forDate?: Date): Promise<{ blocks: BriefBlock[]; raw: string; filePath?: string; error?: string }> {
  if (!isConfigured()) return { blocks: [], raw: '', error: 'GEMINI_API_KEY missing' };
  const today = forDate || new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);

  const [tasks, projects, metas, eventsToday, eventsTomorrow, ideas] = await Promise.all([
    loadTasks(),
    loadProjects(),
    loadProjectMetas(),
    loadCalEvents(today.toISOString(), tomorrow.toISOString()),
    loadCalEvents(tomorrow.toISOString(), dayAfter.toISOString()),
    loadIdeas(),
  ]);
  const openTasks = tasks.filter(t => !t.done);
  const todayStart = new Date(today); todayStart.setHours(0,0,0,0);
  const doneYesterday = tasks.filter(t => t.done && t.doneAt && Date.parse(t.doneAt) >= yesterday.getTime() && Date.parse(t.doneAt) < todayStart.getTime());
  const brutes = ideas.filter(i => i.statut === 'brute').slice(0, 6);

  const context = [
    `Date: ${today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
    `Demain: ${tomorrow.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    '',
    `=== TÂCHES OUVERTES (${openTasks.length}) ===`,
    ...openTasks.slice(0, 30).map(t => `- [${t.size}] ${t.project ? '@'+t.project+' ' : ''}${t.title}${t.tags.length ? ' ('+t.tags.join(',')+')' : ''}`),
    '',
    `=== EVENTS AUJOURD'HUI (${eventsToday.length}) ===`,
    ...eventsToday.map(e => `- ${new Date(e.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}${e.end ? '→'+new Date(e.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : ''} ${e.title}${e.project ? ' @'+e.project : ''}`),
    '',
    `=== EVENTS DEMAIN (${eventsTomorrow.length}) ===`,
    ...eventsTomorrow.map(e => `- ${new Date(e.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} ${e.title}${e.project ? ' @'+e.project : ''}`),
    '',
    `=== PROJETS ACTIFS ===`,
    ...metas.map(m => `- ${m.name} (P${m.priority||3}, ${m.status||'?'}${m.deadline ? ', deadline '+m.deadline : ''}): ${m.description?.slice(0, 100) || ''}`),
    '',
    `=== TÂCHES MARQUÉES "DONE" HIER (${doneYesterday.length}) ===`,
    doneYesterday.length === 0
      ? `(aucune tâche cochée hier)`
      : doneYesterday.slice(0, 12).map(t => `- ${t.title}`).join('\n'),
    '',
    brutes.length ? `=== IDÉES BRUTES À EXPLORER (${brutes.length}) ===` : '',
    ...brutes.map(i => `- [${i.domaine}] ${i.title}`),
  ].filter(Boolean).join('\n');

  const prompt = `Tu es l'assistant matinal d'un tableau de bord personnel. Tu rédiges le brief du jour à partir du contexte ci-dessous, et de lui seul.

# CONTRAINTES STRICTES
1. Pas d'invention : aucun événement, contact, achat, rendez-vous ou engagement absent du contexte.
2. "Ce qui s'est passé" = les tâches cochées hier. Si la liste est vide, dis-le en une ligne.
3. Ne recopie pas la liste des tâches ouvertes : choisis ce qui compte AUJOURD'HUI (events du jour, deadlines proches, gros morceaux en attente).
4. Ton : log de dev, factuel, tutoiement. Pas de motivationnel. Pas d'emoji (à part les ⌘ des titres).

# FORMAT EXACT — 3 sections, titres EXACTS

⌘ OVERNIGHT
2-4 lignes : ce qui a avancé depuis hier, regroupé par projet.

⌘ PRIORITÉ J
Liste numérotée 3-5 actions concrètes pour aujourd'hui, chacune avec 1 phrase de pourquoi. Heure des events si présents.

⌘ CONTEXTE LATÉRAL
2-4 lignes : deadlines à venir, projets qui stagnent, idées brutes qui méritent une heure.

# RÉPONSE
UNIQUEMENT le brief en texte brut. Pas de markdown wrapping, pas de bloc \`\`\`, pas de préambule, pas d'épilogue.

# CONTEXTE (source de vérité unique pour ce brief)
${context}
`;

  const r = await generate([{ role: 'user', parts: [{ text: prompt }] }], undefined);
  if (r.error) return { blocks: [], raw: '', error: r.error.message };
  const text = (r.candidates?.[0]?.content.parts || []).map(p => p.text || '').join('').trim();

  const blocks = parseBrief(text);

  // Save in vault
  await mkdir(BRIEFS_DIR, { recursive: true });
  const filePath = join(BRIEFS_DIR, `${ymd(today)}.md`);
  const fm = `---\ntype: brief\ndate: ${ymd(today)}\ngenerated_at: ${new Date().toISOString()}\nsource: gemini\n---\n\n# Morning Brief — ${today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n${text}\n`;
  await writeFile(filePath, fm, 'utf8');

  return { blocks, raw: text, filePath };
}

export async function getLatestBrief(): Promise<{ blocks: BriefBlock[]; date: string } | null> {
  try { await stat(BRIEFS_DIR); } catch { return null; }
  const todayPath = join(BRIEFS_DIR, `${ymd()}.md`);
  let path = todayPath;
  try { await stat(todayPath); } catch {
    // fallback : prendre le dernier brief existant
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(BRIEFS_DIR)).filter(f => f.endsWith('.md')).sort().reverse();
    if (!files.length) return null;
    path = join(BRIEFS_DIR, files[0]);
  }
  const raw = await readFile(path, 'utf8');
  // Strip frontmatter and the H1 title
  const body = raw.replace(/^---[\s\S]*?---\n+/, '').replace(/^# .*\n+/, '');
  const blocks = parseBrief(body);
  return { blocks, date: path.split('/').pop()!.replace('.md', '') };
}

// Scheduler : check chaque 10 min si on doit générer (23h00 chaque soir)
let lastRun: string | null = null;
export function startBriefScheduler() {
  async function tick() {
    const now = new Date();
    const tag = `${ymd(now)}-${now.getHours()}`;
    if (now.getHours() === 23 && now.getMinutes() >= 0 && now.getMinutes() < 10 && lastRun !== tag) {
      lastRun = tag;
      try {
        // Generate brief for tomorrow
        const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
        const r = await generateBrief(tomorrow);
        if (!r.error) {
          console.log(`[morning-brief] generated ${r.filePath}`); // notifié à 7 h 30, pas la nuit
        } else {
          console.warn(`[morning-brief] error: ${r.error}`);
        }
      } catch (e) {
        console.warn('[morning-brief] failed', e);
      }
    }
  }
  // 7 h 30 : le brief du jour arrive sur le téléphone (priorités), un appui ouvre /today
  let lastPush: string | null = null;
  async function morningPush() {
    const now = new Date();
    // Le conteneur est en UTC : heure locale explicite (TIME_ZONE)
    const local = new Date(now.toLocaleString('en-US', { timeZone: TIME_ZONE }));
    if (local.getHours() !== 7 || local.getMinutes() < 30 || lastPush === ymd(now)) return;
    lastPush = ymd(now);
    const brief = await getLatestBrief().catch(() => null);
    if (!brief || brief.date !== ymd(now)) return;
    const body = (name: string) => brief.blocks.find(b => b.section === name)?.body || '';
    const priorities = body('PRIORITÉ J').split('\n').filter(l => /^\s*\d+\./.test(l)).slice(0, 4)
      .map(l => l.replace(/^\s*(\d+)\.\s+/, '$1. ').split('. ').slice(0, 2).join('. '));
    await notify({
      title: `BRIEF · ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      message: priorities.filter(Boolean).join('\n').slice(0, 900),
      priority: 3, tags: ['sunrise'], click: `${PUBLIC_URL}/today`,
      actions: [{ action: 'view', label: 'Today', url: `${PUBLIC_URL}/today` }],
    }).catch(() => {});
  }
  setInterval(() => { tick(); morningPush(); }, 5 * 60 * 1000); // toutes les 5 min
  tick();
}
