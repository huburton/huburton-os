// API entry point: builds the Hono app, prepares the demo vault if asked, starts the background schedulers.
import app from './app.ts';
import { VAULT_ROOT } from './config.ts';
import { prepareDemoVault } from './demo.ts';
import { startBriefScheduler } from './morning-brief.ts';
import { startGoogleSyncScheduler } from './google-calendar.ts';

// DEMO_VAULT_TEMPLATE=<dir>: copy the fictional vault into VAULT_ROOT, with dates shifted around today
if (process.env.DEMO_VAULT_TEMPLATE) {
  const n = await prepareDemoVault(process.env.DEMO_VAULT_TEMPLATE, VAULT_ROOT, { overwrite: process.env.DEMO_RESET === '1' });
  console.log(n ? `[demo] ${n} notes written to ${VAULT_ROOT}` : `[demo] reusing existing ${VAULT_ROOT}`);
}

startBriefScheduler();
startGoogleSyncScheduler();

const port = parseInt(process.env.PORT || '4000', 10);
console.log(`[huburton-os-api] listening on :${port}, vault ${VAULT_ROOT}`);
// idleTimeout: Bun closes idle sockets after 10 s by default; the brief (LLM) and SSE need longer
export default { port, fetch: app.fetch, idleTimeout: 120 };
