import { createRequire } from 'node:module';
import type * as webConfiguration from '../apps/web/src/shared/config';

// The Next workspace is CommonJS; use its public API through the Node/tsx loader.
const { assertVercelEnvironment }: typeof webConfiguration = createRequire(import.meta.url)(
  '../apps/web/src/shared/config',
);

try {
  assertVercelEnvironment(process.env);
  console.log('Originea Vercel Services este validă; infrastructura nu a fost verificată.');
} catch {
  console.error(
    'Configurație Vercel invalidă. Verificați originea, realtime și separarea secretelor conform docs/vercel.md.',
  );
  process.exitCode = 1;
}
