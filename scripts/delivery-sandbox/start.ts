import { readFile } from 'node:fs/promises';
import { createDeliverySandbox } from './model/server';
import { posOrigin, sandboxHost, sandboxPort, storefrontKeyFile } from './config/server.constants';

if (process.env.NODE_ENV === 'production')
  throw new Error('Website-ul demonstrativ refuză modul production.');
let apiKey = process.env.WEBSITE_POS_API_KEY?.trim() ?? '';
if (!apiKey) {
  try {
    apiKey = (await readFile(storefrontKeyFile, 'utf8')).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
const server = createDeliverySandbox({ apiKey, posOrigin });
server.on('error', () => {
  console.error('Website-ul local nu a pornit. Verifică dacă portul 3002 este deja ocupat.');
  process.exitCode = 1;
});
server.listen(sandboxPort, sandboxHost, () => {
  console.log(`Website local: http://${sandboxHost}:${sandboxPort}`);
  console.log(
    apiKey
      ? 'Cheia POS este configurată exclusiv pe server. Cumpărarea creează o comandă reală în POS-ul local.'
      : 'Configurează cheia backendului cu scripts/pnpm run website:configure.',
  );
});
