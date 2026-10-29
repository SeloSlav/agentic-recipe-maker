/**
 * Shared vector store factory.
 * Provider-selected embeddings, a single pgvector extension check,
 * and cached PGVectorStore instances per table.
 */
import { PGVectorStore } from "@langchain/pgvector";
import { createEmbeddings, resolveVectorTableName } from "../ai-embeddings";
import { getAIConfig } from "../ai-config";
export { resolveVectorTableName } from "../ai-embeddings";
import { Pool, PoolConfig } from "pg";


let extensionEnsured = false;
const storeCache = new Map<string, PGVectorStore>();
let sharedPool: Pool | null = null;



export function getConnectionConfig(): PoolConfig | null {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  return url ? { connectionString: url } : null;
}

/** Reusable pool for raw SQL queries (corpus count, stored embeddings, etc.) */
export function getSharedPool(): Pool | null {
  if (sharedPool) return sharedPool;
  const config = getConnectionConfig();
  if (!config) return null;
  sharedPool = new Pool(config);
  return sharedPool;
}

async function ensureExtension(config: PoolConfig): Promise<void> {
  if (extensionEnsured) return;
  const pool = new Pool(config);
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  } finally {
    await pool.end();
  }
  extensionEnsured = true;
}

/** Shut down all cached stores and the shared pool (for CLI scripts that need clean exit). */
export async function closeAllStores(): Promise<void> {
  for (const store of storeCache.values()) {
    try {
      await store.end();
    } catch {
      /* ignore */
    }
  }
  storeCache.clear();
  if (sharedPool) {
    try {
      await sharedPool.end();
    } catch {
      /* ignore */
    }
    sharedPool = null;
  }
}

export async function getOrCreateStore(tableName: string): Promise<PGVectorStore | null> {
  const aiConfig = getAIConfig();
  if (!aiConfig.embeddings.configured) return null;
  tableName = resolveVectorTableName(tableName, aiConfig);
  if (storeCache.has(tableName)) return storeCache.get(tableName)!;
  const config = getConnectionConfig();
  if (!config) return null;
  const embeddings = createEmbeddings(aiConfig);
  if (!embeddings) return null;

  try {
    await ensureExtension(config);
    const store = await PGVectorStore.initialize(embeddings, {
      postgresConnectionOptions: config,
      tableName,
      distanceStrategy: "cosine",
    });
    storeCache.set(tableName, store);
    return store;
  } catch (err) {
    console.error(`Failed to init vector store [${tableName}]:`, err);
    return null;
  }
}
