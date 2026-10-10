import type { SessionOrganization, SessionUser } from './session.types';
export function safeUser(user: SessionUser) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    displayName: user.displayName,
    login: user.loginNormalized,
    authenticationMethod: user.authenticationMethod ?? 'PASSWORD',
    isPrimaryAdmin: user.isPrimaryAdmin ?? false,
    mustChangePassword: user.mustChangePassword,
    mfaRequired: user.mfaRequired ?? true,
    status: user.status,
    version: user.version,
  };
}
export function safeOrganization(org: SessionOrganization) {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    currency: org.currency,
    locale: org.locale,
    timezone: org.timezone,
    status: org.status,
  };
}
