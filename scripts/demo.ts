// `bun run demo`: API + front against a copy of demo-vault/, every external integration off.
//   bun run demo            reuse .demo-data/vault if it exists (your edits survive restarts)
//   bun run demo --reset    start again from demo-vault/ with dates shifted around today
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const root = join(import.meta.dir, '..');
const vault = join(root, '.demo-data', 'vault');
const apiPort = process.env.PORT || '4000';
const frontPort = process.env.FRONT_PORT || '4321';

if (process.argv.includes('--reset')) rmSync(vault, { recursive: true, force: true });

const env = {
  ...process.env,
  VAULT_ROOT: vault,
  DEMO_VAULT_TEMPLATE: join(root, 'demo-vault'),
  OFFLINE: process.env.OFFLINE ?? '1',
  DOCKER_SOCKET: process.env.DOCKER_SOCKET ?? 'off',
  PORT: apiPort,
  API_URL: `http://127.0.0.1:${apiPort}`,
  FRONT_PORT: frontPort,
  PUBLIC_URL: `http://localhost:${frontPort}`,
};

const api = Bun.spawn(['bun', 'src/index.ts'], { cwd: join(root, 'backend'), env, stdout: 'inherit', stderr: 'inherit' });
const front = Bun.spawn(['bun', 'x', 'astro', 'dev'], { cwd: root, env, stdout: 'inherit', stderr: 'inherit' });
console.log(`\n  huburton/os demo -> http://localhost:${frontPort}  (API on :${apiPort}, vault ${vault})\n`);

const stop = () => { api.kill(); front.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await Promise.race([api.exited, front.exited]);
stop();
