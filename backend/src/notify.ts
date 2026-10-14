// ntfy wrapper: push notifications (phone + desktop) on a private, authenticated topic.
// Uses the JSON publishing API (POST /) to avoid HTTP header encoding limits on titles.
// Disabled (returns false) when NTFY_URL or NTFY_TOPIC is not set.
import { PUBLIC_URL } from './config.ts';

const NTFY_URL = (process.env.NTFY_URL || '').replace(/\/$/, '');
const NTFY_TOPIC = process.env.NTFY_TOPIC || '';
const NTFY_AUTH = process.env.NTFY_AUTH || ''; // e.g. "Bearer tk_..." or "Basic ..."

export const isNotifyConfigured = () => !!NTFY_URL && !!NTFY_TOPIC;

interface NotifyOpts {
  title: string;
  message?: string;
  priority?: 1 | 2 | 3 | 4 | 5; // 1=min … 5=max (urgent)
  tags?: string[];              // emoji shortcodes : warning, white_check_mark, briefcase
  click?: string;               // URL ouverte au tap
  attach?: string;              // URL d'une image jointe (s'affiche dans la notif)
  icon?: string;                // URL d'icône (apparait à côté du titre)
  actions?: Array<{ action: 'view' | 'http'; label: string; url: string; clear?: boolean }>;
  delay?: string;               // ex "30min", "tomorrow, 9am"
}

export async function notify(opts: NotifyOpts): Promise<boolean> {
  if (!isNotifyConfigured()) return false;
  try {
    const body: any = {
      topic: NTFY_TOPIC,
      title: opts.title,
    };
    if (opts.message) body.message = opts.message;
    if (opts.priority) body.priority = opts.priority;
    if (opts.tags?.length) body.tags = opts.tags;
    if (opts.click) body.click = opts.click;
    if (opts.attach) body.attach = opts.attach;
    if (opts.icon) body.icon = opts.icon;
    if (opts.delay) body.delay = opts.delay;
    if (opts.actions?.length) body.actions = opts.actions;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (NTFY_AUTH) headers['Authorization'] = NTFY_AUTH;
    const r = await fetch(`${NTFY_URL}/`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) console.warn('[notify] failed', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) {
    console.warn('[notify] error', e);
    return false;
  }
}

export async function notifyTest(): Promise<boolean> {
  return notify({
    title: 'ntfy test',
    message: 'If you can read this, the topic and credentials are OK.',
    priority: 3, tags: ['bell'],
    click: PUBLIC_URL,
  });
}
