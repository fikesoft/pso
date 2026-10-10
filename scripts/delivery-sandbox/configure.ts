import { mkdir, open } from 'node:fs/promises';
import { posOrigin, storefrontKeyFile } from './config/server.constants';
import { requestPos, validateStorefrontConfig } from './model/pos-client';

if (process.env.NODE_ENV === 'production') throw new Error('Configurare exclusiv locală.');
if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  throw new Error(
    'Rulează comanda într-un terminal interactiv pentru introducerea ascunsă a cheii.',
  );
}
console.log(
  'Lipește cheia emisă în POS → Livrări website. Textul nu va fi afișat. Enter confirmă, Ctrl+C anulează.',
);
const apiKey = await new Promise<string>((resolve, reject) => {
  let value = '';
  process.stdin.setRawMode(true);
  process.stdin.resume();
  function finish(error?: Error) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.off('data', receive);
    if (error) reject(error);
    else resolve(value.trim());
  }
  function receive(chunk: Buffer) {
    for (const character of chunk.toString('utf8')) {
      if (character === '\u0003') {
        finish(new Error('Configurare anulată.'));
        return;
      }
      if (character === '\r' || character === '\n') {
        finish();
        return;
      }
      if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
      else if (character >= ' ' && character <= '~') value += character;
      if (value.length > 256) {
        finish(new Error('Cheie prea lungă.'));
        return;
      }
    }
  }
  process.stdin.on('data', receive);
});
const config = { apiKey, posOrigin };
validateStorefrontConfig(config);
const result = await requestPos(config, '/api/integrations/catalog');
if (result.status !== 200)
  throw new Error('POS nu a acceptat cheia. Fișierul existent rămâne neschimbat.');
await mkdir(new URL('.', storefrontKeyFile), { recursive: true });
const file = await open(storefrontKeyFile, 'w', 0o600);
try {
  await file.chmod(0o600);
  await file.writeFile(`${apiKey}\n`);
} finally {
  await file.close();
}
console.log(
  'Cheia a fost verificată și salvată numai pentru backend. Repornește website-ul pe portul 3002.',
);
