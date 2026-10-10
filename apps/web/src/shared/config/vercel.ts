import { realtimeUrl } from '@pos/contracts/realtime';
import { tenantDeploymentOrigin } from '@pos/contracts/deployment';
import { vercelForbiddenVariables, vercelServerSecrets } from './vercel.constants';

export function publicHttpsOrigin(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} este obligatoriu pentru Vercel.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} trebuie să fie o origine HTTPS validă.`);
  }
  if (
    url.protocol !== 'https:' ||
    value !== url.origin ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname.includes('.') ||
    url.hostname.endsWith('.localhost') ||
    url.hostname.endsWith('.local') ||
    url.hostname.endsWith('.invalid') ||
    url.hostname.endsWith('.internal') ||
    /^[\d.]+$/.test(url.hostname) ||
    url.hostname.includes(':')
  )
    throw new Error(`${name} trebuie să fie o origine HTTPS cu domeniu public, fără credențiale.`);
  return url.origin;
}

export function assertVercelEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  const origin = publicHttpsOrigin(tenantDeploymentOrigin(environment), 'TENANT_ORIGIN');
  try {
    const live = new URL(realtimeUrl(origin, environment.TENANT_REALTIME_URL, false));
    if (live.host !== new URL(origin).host) throw new Error('Realtime port mismatch');
  } catch {
    throw new Error('Realtime Vercel trebuie să folosească aceeași gazdă și port HTTPS.');
  }
  if (
    vercelForbiddenVariables.some((name) => environment[name]) ||
    vercelServerSecrets.some((name) => environment[`NEXT_PUBLIC_${name}`])
  )
    throw new Error(
      'Vercel nu primește credențiale de platformă/migrare și nu publică secrete în NEXT_PUBLIC.',
    );
}
