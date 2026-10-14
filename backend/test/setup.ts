// Runs before every test file: copies the demo vault into a temp dir and points the API at it.
// Must happen before src/config.ts is imported, since VAULT_ROOT is read once at load time.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'bun:test';
import { prepareDemoVault } from '../src/demo.ts';

const dir = mkdtempSync(join(tmpdir(), 'huburton-os-test-'));
process.env.VAULT_ROOT = dir;
process.env.OFFLINE = '1';
for (const k of ['GEMINI_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NTFY_URL', 'TMDB_API_KEY', 'TMDB_READ_TOKEN']) delete process.env[k];

await prepareDemoVault(join(import.meta.dir, '..', '..', 'demo-vault'), dir);

afterAll(() => rmSync(dir, { recursive: true, force: true }));
