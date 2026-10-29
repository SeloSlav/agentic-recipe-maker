import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('release metadata and npm scripts reference distributed files', async () => {
  const pkg = await json('package.json');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.engines.node, '>=22');
  for (const script of Object.values(pkg.scripts)) {
    for (const [, target] of script.matchAll(/(?:node|tsx) (scripts\/[^\s]+)/g)) await access(path.join(root, target));
  }
  for (const file of ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', '.env.example', '.github/workflows/ci.yml']) await access(path.join(root, file));
});

test('the dependency tree contains no legacy backend SDKs', async () => {
  const lock = await json('package-lock.json');
  const legacyPackage = /(?:^|node_modules\/)(?:firebase(?:-admin|-functions)?|@firebase\/[^/]+)$/;
  assert.deepEqual(Object.keys(lock.packages).filter(name => legacyPackage.test(name)), []);
});

test('distributed application code has no legacy SDK imports or backend selector', async () => {
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(file);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
        const source = await readFile(file, 'utf8');
        assert.ok(!/(?:from\s+|import\s*\()['"](?:firebase|firebase-admin|firebase-functions)(?:\/|['"])/.test(source), `Legacy SDK import in ${file}`);
        assert.ok(!source.includes('NEXT_PUBLIC_BACKEND'), `Obsolete backend selector in ${file}`);
      }
    }
  }
  await scan(path.join(root, 'app'));
});

test('private runtime state and credentials stay outside the distributed repository', () => {
  const privatePaths = ['.env.local', '.local/session-key', '.local/spacetime-owner.json', '.local/uploads/test.png', 'spacetimedb/dist/bundle.js'];
  for (const file of privatePaths) {
    execFileSync('git', ['check-ignore', '--no-index', '--quiet', file], { cwd: root });
  }
});
