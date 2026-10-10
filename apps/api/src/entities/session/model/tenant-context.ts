import { assert } from '../../../shared/lib/http';
import type { SessionUser } from './session.types';
export function tenantContext(user: SessionUser) {
  assert(user.organizationId, 401, 'Identitatea companiei lipsește');
  return { organizationId: user.organizationId, userId: user.id };
}
