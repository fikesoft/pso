export function assertVercelApiEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (environment.NODE_ENV !== 'production')
    throw new Error('API-ul Vercel necesită NODE_ENV=production pentru cookie-uri Secure.');
  for (const [name, role] of [
    ['DATABASE_URL', 'pos_runtime'],
    ['AUTH_DATABASE_URL', 'pos_auth'],
  ]) {
    let url: URL;
    try {
      url = new URL(environment[name] ?? '');
    } catch {
      throw new Error(`Conexiunea ${name} lipsește sau nu este validă.`);
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      decodeURIComponent(url.username) !== role ||
      !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '') ||
      url.hostname.includes('-pooler.')
    )
      throw new Error(`${name} necesită rolul restrâns ${role}, TLS și conexiune directă.`);
  }
  if (
    environment.PLATFORM_DATABASE_URL ||
    environment.MIGRATION_DATABASE_URL ||
    environment.NEON_ADMIN_DATABASE_URL ||
    environment.PRIVATE_PLATFORM_MFA_KEY ||
    environment.PRIVATE_PLATFORM_CSRF_SECRET ||
    environment.PLATFORM_PRIVATE_READY === 'true'
  )
    throw new Error('Control plane-ul și credențialele migrațiilor nu se publică pe Vercel.');
  if (environment.MEDIA_STORAGE !== 'vercel-blob' || !environment.BLOB_READ_WRITE_TOKEN)
    throw new Error('Vercel necesită un store Blob privat configurat pentru fotografii.');
}
