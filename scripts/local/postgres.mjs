import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import path from 'node:path';
import { root, env } from './stack.mjs';

const db = await PGlite.create(path.join(root, '.local/postgres'), { extensions: { vector } });
await db.exec('CREATE EXTENSION IF NOT EXISTS vector');
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: Number(new URL(env.POSTGRES_URL).port || 5433), maxConnections: 20 });
await server.start();
console.log('PostgreSQL/pgvector ready (PGlite, persistent local files).');
let closing = false;
async function close() { if (closing) return; closing = true; await server.stop(); await db.close(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
