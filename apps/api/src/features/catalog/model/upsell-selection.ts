import type { TenantTransaction } from '@pos/db';
import { MAX_UPSELL_SUGGESTIONS } from '@pos/contracts/upsell';
import { loadUpsellCandidates } from '../../../entities/upsell';
import { loadScheduleAvailability } from '../../../entities/menu-schedule';
import { scopeFor } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireUpsellSuggestionAccess(
  access: AccessData,
  userId: string,
  locationId: string,
) {
  assert(
    access.locations.some((location) => location.id === locationId && location.status === 'ACTIVE'),
    403,
    'Locație nepermisă',
  );
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(
    ['catalog.read', 'catalog.manage', 'orders.create'].some((permission) =>
      access.service.canUse(userId, permission, scope),
    ),
  );
}
export async function selectUpsellSuggestions(
  tx: TenantTransaction,
  locationId: string,
  productIds: string[],
) {
  const candidates = await loadUpsellCandidates(tx, locationId, productIds);
  const ids = [
    ...new Set(candidates.flatMap(({ rule }) => [rule.sourceProductId, rule.targetProductId])),
  ];
  const availability = await loadScheduleAvailability(tx, locationId, ids);
  const targets = new Set<string>();
  const selected = candidates
    .filter(({ rule }) => {
      if (
        targets.has(rule.targetProductId) ||
        availability.get(rule.sourceProductId)?.available !== true ||
        availability.get(rule.targetProductId)?.available !== true
      )
        return false;
      targets.add(rule.targetProductId);
      return true;
    })
    .slice(0, MAX_UPSELL_SUGGESTIONS);
  return { selected, availability };
}
