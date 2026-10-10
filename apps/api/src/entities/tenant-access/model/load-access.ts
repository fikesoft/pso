import type { Scope } from '@pos/authz';
import { PERMISSIONS } from '@pos/authz';
import type { TenantTransaction } from '@pos/db';
import type { TenantActorReference } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import type { AccessData, ScopeInput } from './access.types';
import { loadAuthorization } from './authorization-policy';
export { permissionEntries, loadAuthorization } from './authorization-policy';

export async function loadAccess(tx: TenantTransaction, auth: TenantActorReference) {
  const data = await loadAuthorization(tx, auth.user.organizationId);
  const current = data.users.find((user) => user.id === auth.user.id);
  assert(
    current && current.status === 'ACTIVE' && current.authVersion === auth.session.authVersion,
    401,
    'Sesiunea a fost revocată',
  );
  const currentSession = await tx.tenantSession.findUnique({ where: { id: auth.session.id } });
  assert(
    currentSession &&
      !currentSession.revokedAt &&
      currentSession.authVersion === current.authVersion &&
      currentSession.authenticationMethod === current.authenticationMethod &&
      currentSession.expiresAt > new Date() &&
      currentSession.idleExpiresAt > new Date(),
    401,
    'Sesiunea a fost revocată',
  );
  const administrative =
    current.mfaRequired || current.isPrimaryAdmin || data.service.requiresMfa(current.id);
  assert(
    current.authenticationMethod !== 'PIN' || !administrative,
    401,
    'Sesiunea a fost revocată',
  );
  assert(
    data.org.status === 'ACTIVE' && !current.mustChangePassword,
    403,
    'Finalizați activarea contului',
  );
  assert(
    !administrative || !!currentSession.mfaVerifiedAt,
    403,
    'Verificarea MFA este necesară pentru accesul actual',
  );
  return { ...data, currentUser: current };
}

export function scopeFor(org: string, body: ScopeInput): Scope {
  return {
    organizationId: org,
    scopeType: body.scopeType === 'LOCATION' ? 'LOCATION' : 'ORGANIZATION',
    locationId: body.locationId ?? null,
  };
}
export function hasAny(data: AccessData, actor: string, permission: string) {
  return (
    data.service.canUse(actor, permission, scopeFor(data.org.id, {})) ||
    data.locations.some((l) =>
      data.service.canUse(
        actor,
        permission,
        scopeFor(data.org.id, { scopeType: 'LOCATION', locationId: l.id }),
      ),
    )
  );
}
export function visibleLocations(data: AccessData, actor: string) {
  const user = data.snapshot.users.find((u) => u.id === actor);
  return data.locations.filter(
    (l) =>
      l.status === 'ACTIVE' &&
      (actor === data.org.primaryAdminUserId || user?.locationIds.includes(l.id)),
  );
}
export { PERMISSIONS };
