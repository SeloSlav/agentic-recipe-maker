import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { fixtures } from './seed.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, '.env'), quiet: true });
export const env = {
  ...process.env,
  SPACETIMEDB_URL: process.env.LOCAL_SPACETIMEDB_URL || `http://127.0.0.1:${process.env.LOCAL_SPACETIME_PORT || 3100}`,
  SPACETIMEDB_DATABASE: process.env.LOCAL_SPACETIMEDB_DATABASE || 'baba-selo-local',
  POSTGRES_URL: process.env.LOCAL_POSTGRES_URL || `postgresql://baba:baba-local-only@127.0.0.1:${process.env.LOCAL_POSTGRES_PORT || 5433}/baba_selo`,
  PORT: process.env.LOCAL_APP_PORT || '3001',
};
env.DATABASE_URL = env.POSTGRES_URL;
// Local development never picks up production payments, email, or cron credentials.
for (const key of Object.keys(env)) if (/^(STRIPE_|RESEND_|CRON_SECRET|VERCEL_)/.test(key)) delete env[key];

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true, ...options });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
export const npm = (args, options) => run(process.execPath, [process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args], options);
export async function waitFor(url) {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Service did not become ready: ${url}`);
}
export async function setup({ containers = true } = {}) {
  await mkdir(path.join(root, '.local'), { recursive: true });
  const keyPath = path.join(root, '.local/session-key');
  try { await writeFile(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (err) { if (err.code !== 'EEXIST') throw err; }
  if (containers) await run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'spacetime']);
  await waitFor(`${env.SPACETIMEDB_URL}/v1/ping`);
  const ownerPath = path.join(root, '.local/spacetime-owner.json');
  let owner;
  try { owner = JSON.parse(await readFile(ownerPath, 'utf8')); }
  catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const response = await fetch(`${env.SPACETIMEDB_URL}/v1/identity`, { method: 'POST' });
    if (!response.ok) throw new Error('Could not create local database identity');
    owner = await response.json(); await writeFile(ownerPath, JSON.stringify(owner), { mode: 0o600 });
  }
  const headers = { Authorization: `Bearer ${owner.token}` };
  try { await access(path.join(root, 'spacetimedb/node_modules/spacetimedb')); }
  catch { await npm(['ci', '--include=dev', '--prefix', 'spacetimedb']); }
  await npm(['run', 'build', '--prefix', 'spacetimedb']);
  const bundle = await readFile(path.join(root, 'spacetimedb/dist/bundle.js'));
  const databaseUrl = `${env.SPACETIMEDB_URL}/v1/database/${encodeURIComponent(env.SPACETIMEDB_DATABASE)}`;
  const published = await fetch(`${databaseUrl}?host_type=Js`, { method: 'PUT', headers, body: bundle });
  if (!published.ok) throw new Error(`Module publish failed (${published.status}): ${await published.text()}`);
  const missing = [];
  for (const fixture of fixtures) {
    const response = await fetch(`${databaseUrl}/sql`, { method: 'POST', headers, body: `SELECT path FROM document WHERE path = '${fixture.path}'` });
    if (!response.ok) throw new Error(`Could not inspect fixtures: ${await response.text()}`);
    if (!(await response.json())[0]?.rows.length) missing.push({ ...fixture, mode: 'set' });
  }
  if (missing.length) {
    const response = await fetch(`${databaseUrl}/call/commit`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify([JSON.stringify(missing)]) });
    if (!response.ok) throw new Error(`Seed failed: ${await response.text()}`);
  }
  const pool = new Pool({ connectionString: env.POSTGRES_URL, connectionTimeoutMillis: 5000 });
  try { await pool.query('CREATE EXTENSION IF NOT EXISTS vector'); } finally { await pool.end(); }
  console.log('Local databases ready. Existing data was preserved.');
  console.log(`AI provider: ${env.AI_PROVIDER || 'openai'}. Configure cloud credentials or a local model in .env.local; see docs/AI_PROVIDERS.md.`);
}
