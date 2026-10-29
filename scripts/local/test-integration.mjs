import { spawn } from 'node:child_process';
import path from 'node:path';
import { root } from './stack.mjs';
const child = spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), '--test', 'scripts/local/backend.test.ts'], {
  cwd: root, env: { ...process.env, LOCAL_INTEGRATION: '1' }, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
