/** Use configured origins, never an untrusted Host or forwarded header. */
export function tenantDeploymentOrigin(environment: Readonly<Record<string, string | undefined>>) {
  const value =
    environment.TENANT_ORIGIN ||
    (environment.VERCEL === '1' && environment.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${environment.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://127.0.0.1:3000');
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error('Originea tenantului nu este validă.');
  }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/')
    throw new Error('Originea tenantului nu este validă.');
  if (environment.VERCEL === '1' && origin.protocol !== 'https:')
    throw new Error('Vercel necesită o origine tenant HTTPS.');
  return origin.origin;
}
