/** Index the running local app's saved recipes. --dry-run never calls the AI provider. */
import { env } from './local/stack.mjs';

const base = `http://127.0.0.1:${env.PORT}`;
const login = await fetch(`${base}/api/local/session`, { method: 'POST' });
if (!login.ok) throw new Error('Start npm run dev before syncing recipes.');
const { token } = await login.json();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
if (process.argv.includes('--dry-run')) {
  const response = await fetch(`${base}/api/local/data`, { method: 'POST', headers, body: JSON.stringify({ action: 'query', path: 'recipes' }) });
  if (!response.ok) throw new Error('Could not read local recipes.');
  console.log(`${(await response.json()).length} recipes available to index. No embeddings were requested.`);
} else {
  const response = await fetch(`${base}/api/admin/sync-recipes`, { method: 'POST', headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Recipe indexing failed.');
  console.log(`Indexed ${result.synced} recipes in local pgvector.`);
}
