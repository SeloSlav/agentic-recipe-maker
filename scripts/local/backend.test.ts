import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PGVectorStore } from '@langchain/pgvector';
import { Document } from '@langchain/core/documents';
import { selectRows } from '../../app/lib/backend/protocol';
import { encode } from '../../app/lib/backend/protocol';
import { Timestamp } from '../../app/lib/backend/timestamp';
import { db, doc, getDoc } from '../../app/lib/backend/database';

test('native timestamps round-trip dates, negative epochs, and snapshot fields', async context => {
  for (const millis of [-1001, -1, 0, 1234, 1793260800123]) {
    const stamp = Timestamp.fromMillis(millis);
    assert.equal(stamp.toMillis(), millis);
    assert.equal(stamp.toDate().getTime(), millis);
    assert.deepEqual(encode(stamp), { __localTimestamp: millis });
  }
  assert.throws(() => Timestamp.fromMillis(NaN), RangeError);
  assert.throws(() => new Timestamp(0, 1e9), RangeError);
  context.mock.method(globalThis, 'fetch', async () => Response.json({ data: { nested: { createdAt: { __localTimestamp: 1234 } } } }));
  const snapshot = await getDoc(doc(db, 'recipes', 'test'));
  assert.ok(snapshot.exists());
  assert.equal(snapshot.get('nested.createdAt').toMillis(), 1234);
  assert.ok(snapshot.data().nested.createdAt instanceof Timestamp);
});

test('query filters, descending pagination, timestamp comparisons, and deterministic ties', () => {
  const rows = [1, 2, 3, 4].map(i => ({ path: `recipes/${i}`, data: { score: i, tags: ['vegetarian'], at: { __localTimestamp: i * 1000 } } }));
  const constraints = [{ kind: 'where', field: 'tags', op: 'array-contains', value: 'vegetarian' }, { kind: 'where', field: 'at', op: '>=', value: { __localTimestamp: 2000 } }, { kind: 'orderBy', field: 'score', direction: 'desc' }, { kind: 'limit', value: 2 }];
  const first = selectRows(rows, constraints);
  assert.deepEqual(first.map(r => r.path), ['recipes/4', 'recipes/3']);
  assert.deepEqual(selectRows(rows, [...constraints, { kind: 'startAfter', value: first[1] }]).map(r => r.path), ['recipes/2']);
});

const integration = process.env.LOCAL_INTEGRATION === '1';
test('local sessions, admin topology, atomic reducers, uploads, and access restrictions', { skip: !integration }, async () => {
  const url = process.env.LOCAL_APP_URL || 'http://127.0.0.1:3001';
  assert.equal((await fetch(`${url}/api/admin/ai`)).status, 401);
  assert.equal((await fetch(`${url}/api/local/session`, { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const login = await fetch(`${url}/api/local/session`, { method: 'POST', headers: { Origin: url } });
  assert.equal(login.status, 200);
  const { token, user } = await login.json();
  assert.equal(user.uid, 'local-developer');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const data = async (op: any) => {
    const response = await fetch(`${url}/api/local/data`, { method: 'POST', headers, body: JSON.stringify(op) });
    return { response, result: await response.json() };
  };
  const path = `localTests/${randomUUID()}`, child = `${path}/children/one`;
  const key = `tests/${randomUUID()}.png`;
  try {
    assert.equal((await data({ action: 'write', writes: [{ path, mode: 'set', data: { count: 0, tags: ['a'], nested: { keep: true }, at: { __localTransform: 'timestamp' } } }, { path: child, mode: 'set', data: { name: 'child' } }] })).response.status, 200);
    await Promise.all(Array.from({ length: 5 }, () => data({ action: 'write', writes: [{ path, mode: 'update', data: { count: { __localTransform: 'increment', value: 1 }, tags: { __localTransform: 'union', value: ['b'] }, 'nested.added': true } }] })));
    const saved = (await data({ action: 'get', path })).result.data;
    assert.equal(saved.count, 5); assert.deepEqual(saved.tags, ['a', 'b']); assert.deepEqual(saved.nested, { keep: true, added: true }); assert.ok(saved.at.__localTimestamp > 0);
    const failed = await data({ action: 'write', writes: [{ path, mode: 'update', data: { count: 99 } }, { path: `${path}-missing`, mode: 'update', data: { count: 1 } }] });
    assert.equal(failed.response.status, 400);
    assert.equal((await data({ action: 'get', path })).result.data.count, 5, 'a failed batch must roll back earlier writes');
    assert.equal((await data({ action: 'query', path: `${path}/children` })).result.length, 1);
    const anonymousWrite = await fetch(`${url}/api/local/data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'write', writes: [{ path, mode: 'delete' }] }) });
    assert.equal(anonymousWrite.status, 401);
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jcMsAAAAASUVORK5CYII=', 'base64');
    const upload = await fetch(`${url}/api/local/files/${key}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: image });
    assert.equal(upload.status, 200);
    const download = await fetch(`${url}/api/local/files/${key}`);
    assert.equal(download.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await download.arrayBuffer()), image);
    const architecture = await fetch(`${url}/api/admin/ai`, { headers });
    const view = await architecture.json(); assert.equal(architecture.status, 200);
    assert.equal(view.tools.length, 14); assert.ok(view.graphs.recipe.nodes.includes('retrieve_corpus')); assert.ok(view.graphs.chat.nodes.includes('tools'));
    assert.equal(view.graphs.recipe.edges.length, 8, 'conditional graph destinations must be explicit for accurate visualization');
    assert.equal(view.services.postgres.status, 'ready');
    assert.ok(!JSON.stringify(view).includes(token), 'architecture must never reveal a session credential');
  } finally {
    await data({ action: 'write', writes: [{ path, mode: 'delete' }, { path: child, mode: 'delete' }] });
    await fetch(`${url}/api/local/files/${key}`, { method: 'DELETE', headers });
  }
});

test('LangChain PGVectorStore uses the local PostgreSQL wire server and filters metadata', { skip: !integration }, async () => {
  const connectionString = process.env.LOCAL_POSTGRES_URL || 'postgresql://baba:baba-local-only@127.0.0.1:5433/baba_selo';
  const table = `test_vectors_${randomUUID().replaceAll('-', '')}`;
  const embeddings = { embedDocuments: async (texts: string[]) => texts.map(t => t.includes('beans') ? [1, 0, 0] : [0, 1, 0]), embedQuery: async () => [1, 0, 0] };
  const pool = new Pool({ connectionString });
  const store = await PGVectorStore.initialize(embeddings as any, { postgresConnectionOptions: { connectionString }, tableName: table, distanceStrategy: 'cosine' });
  try {
    await store.addDocuments([new Document({ pageContent: 'beans', metadata: { type: 'recipe' } }), new Document({ pageContent: 'salad', metadata: { type: 'summary' } })]);
    const result = await store.similaritySearchWithScore('beans', 1, { type: 'recipe' });
    assert.equal(result.length, 1); assert.equal(result[0][0].pageContent, 'beans'); assert.ok(result[0][1] < 0.00001);
    const filtered = await store.similaritySearchWithScore('beans', 1, { type: 'missing' }); assert.equal(filtered.length, 0);
  } finally { await store.end(); await pool.query(`DROP TABLE IF EXISTS ${table}`); await pool.end(); }
});
