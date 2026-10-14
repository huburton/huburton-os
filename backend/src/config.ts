// Runtime configuration, read once from the environment. Every external integration is optional:
// when its key or URL is missing the feature reports itself as "not configured" instead of failing.
import { resolve } from 'node:path';

/** Root of the Obsidian vault used as the database (Markdown files + YAML frontmatter). */
export const VAULT_ROOT = resolve(process.env.VAULT_ROOT || './vault');

/** OFFLINE=1 disables every outbound HTTP call (weather, posters, Wikipedia, Google Books). Used by the demo and tests. */
export const OFFLINE = process.env.OFFLINE === '1';

/** IANA time zone used for Google Calendar pushes and the morning brief schedule. */
export const TIME_ZONE = process.env.TIME_ZONE || 'Europe/Brussels';

/** Public URL of the front-end, used in notification links and the OAuth redirect default. */
export const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:4321').replace(/\/$/, '');
