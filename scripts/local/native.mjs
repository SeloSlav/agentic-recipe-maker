import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { access, mkdir, readdir, writeFile, open, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { root, env, waitFor } from './stack.mjs';

async function available(url) { try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } }
async function spacetimeCommand() {
  if (env.SPACETIME_SERVER_BIN) return [env.SPACETIME_SERVER_BIN];
  if (process.platform === 'win32') {
    const bin = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'SpacetimeDB/bin');
    try {
      const versions = (await readdir(bin)).filter(v => /^\d+\.\d+\.\d+$/.test(v)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of ['2.10.2', ...versions]) {
        const executable = path.join(bin, version, 'spacetimedb-standalone.exe');
        try { await access(executable); return [executable]; } catch {}
      }
    } catch {}
  }
  return ['spacetime'];
}
export async function startNativeServices() {
  await mkdir(path.join(root, '.local'), { recursive: true });
  // A live PID lock prevents two PGlite processes opening the same data directory.
  const lockPath = path.join(root, '.local/dev.lock');
  try {
    const handle = await open(lockPath, 'wx'); await handle.writeFile(String(process.pid)); await handle.close();
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const { readFile } = await import('node:fs/promises');
    const pid = Number(await readFile(lockPath, 'utf8'));
    try { process.kill(pid, 0); } catch (e) {
      if (e.code !== 'ESRCH') throw e;
      await unlink(lockPath); return startNativeServices();
    }
    throw new Error(`Local services are already managed by process ${pid}. Stop that npm run dev process first.`);
  }
  const children = [];
  let closing = false;
  const cleanup = async () => { if (closing) return; closing = true; for (const child of children) child.kill(); await unlink(lockPath).catch(() => {}); };
  const launch = (command, args) => {
    const child = spawn(command, args, { cwd: root, env: { ...env, RUST_LOG: 'error' }, stdio: 'inherit', windowsHide: true });
    children.push(child);
    child.on('error', error => { console.error(`Cannot start ${command}: ${error.message}. Install SpacetimeDB: https://spacetimedb.com/install`); });
    return child;
  };
  try {
    if (!await available(`${env.SPACETIMEDB_URL}/v1/ping`)) {
      const publicKey = path.join(root, '.local/jwt-public.pem'), privateKey = path.join(root, '.local/jwt-private.pem');
      try { await access(privateKey); } catch {
        const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
        await writeFile(publicKey, keys.publicKey); await writeFile(privateKey, keys.privateKey, { mode: 0o600 });
      }
      const [command] = await spacetimeCommand();
      const port = new URL(env.SPACETIMEDB_URL).port;
      launch(command, ['start', '--listen-addr', `127.0.0.1:${port}`, '--data-dir', path.join(root, '.local/spacetimedb'), '--jwt-pub-key-path', publicKey, '--jwt-priv-key-path', privateKey, '--non-interactive']);
      await waitFor(`${env.SPACETIMEDB_URL}/v1/ping`);
    }
    // Explicit external PostgreSQL URL opts out of the embedded development server.
    if (!process.env.LOCAL_POSTGRES_URL) {
      launch(process.execPath, [path.join(root, 'scripts/local/postgres.mjs')]);
      let ready = false;
      for (let i = 0; i < 40; i++) {
        const pool = new Pool({ connectionString: env.POSTGRES_URL, connectionTimeoutMillis: 1000 });
        try { await pool.query('SELECT 1'); ready = true; break; } catch {} finally { await pool.end(); }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!ready) throw new Error('Embedded PostgreSQL did not start. See its error above or choose another LOCAL_POSTGRES_PORT.');
    }
    return cleanup;
  } catch (error) { await cleanup(); throw error; }
}
