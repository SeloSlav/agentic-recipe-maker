import { spawn } from 'node:child_process';
import path from 'node:path';
import { setup, env, root } from './local/stack.mjs';
import { startNativeServices } from './local/native.mjs';
let cleanup = async () => {};
try {
  const docker = process.argv.includes('--docker'), external = process.argv.includes('--external');
  if (!docker && !external) cleanup = await startNativeServices();
  await setup({ containers: docker });
  if (!process.argv.includes('--setup-only')) {
    const command = process.argv.includes('--production') ? 'start' : 'dev';
    const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), command, '--hostname', '127.0.0.1', '-p', env.PORT], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    const stop = async () => { child.kill(); await cleanup(); }; process.on('SIGINT', stop); process.on('SIGTERM', stop);
    child.on('exit', async code => { await cleanup(); process.exitCode = code || 0; });
  } else await cleanup();
} catch (error) { await cleanup(); console.error(`Local startup failed: ${error.message}\nDefault startup uses native SpacetimeDB + PGlite (no Docker). Use --external for your own local database services, or --docker to opt in to Compose.`); process.exitCode = 1; }
