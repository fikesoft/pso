import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const root = process.cwd();
const node = process.execPath;
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
const commands = [
  ['API tenant', ['--import', 'tsx', 'apps/api/src/public-server.ts']],
  ['API platformă', ['--import', 'tsx', 'apps/api/src/platform-server.ts']],
  ['Worker PostgreSQL', ['--import', 'tsx', 'apps/worker/src/main.ts']],
  [
    'Web tenant',
    [
      resolve('apps/web/node_modules/next/dist/bin/next'),
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3000',
    ],
    resolve('apps/web'),
  ],
  [
    'Web platformă',
    [
      resolve('apps/platform-web/node_modules/next/dist/bin/next'),
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3001',
    ],
    resolve('apps/platform-web'),
  ],
];
const children = commands.map(([name, args, cwd]) => {
  const child = spawn(node, args, { cwd: cwd ?? root, env, stdio: 'inherit' });
  child.on('exit', (code) => {
    if (code) console.error(`${name} s-a oprit cu cod ${code}`);
  });
  return child;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
    process.exit(0);
  });
