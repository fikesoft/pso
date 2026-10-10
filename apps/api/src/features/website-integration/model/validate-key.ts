import type { TenantTransaction } from '@pos/db';
import { loadAuthorization, scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { WEBSITE_AUTH_MESSAGE } from '../config/website.constants';
import type { WebsiteKeyReference } from './integration.types';

export async function validateWebsiteKey(tx: TenantTransaction, reference: WebsiteKeyReference) {
  const key = await tx.websiteApiKey.findUnique({ where: { id: reference.keyId } });
  const connection = await tx.websiteConnection.findUnique({
    where: { id: reference.connectionId },
  });
  const location = await tx.location.findUnique({ where: { id: reference.locationId } });
  const access = await loadAuthorization(tx, reference.organizationId);
  const issuer = access.users.find((user) => user.id === reference.createdByUserId);
  assert(
    key &&
      key.secretHash === reference.digest &&
      !key.revokedAt &&
      key.expiresAt > new Date() &&
      connection?.status === 'ACTIVE' &&
      location?.status === 'ACTIVE' &&
      access.org.status === 'ACTIVE' &&
      key.connectionId === connection.id &&
      key.locationId === location.id &&
      connection.locationId === location.id &&
      issuer?.status === 'ACTIVE' &&
      issuer.isPrimaryAdmin &&
      issuer.id === access.org.primaryAdminUserId &&
      access.service.canUse(issuer.id, 'website.integrations.manage', scopeFor(access.org.id, {})),
    401,
    WEBSITE_AUTH_MESSAGE,
  );
  return { organizationId: reference.organizationId, connection, key, location };
}
