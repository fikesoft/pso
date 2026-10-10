import type { Prisma, TenantTransaction } from '@pos/db';
import type { KitchenRoutingIdentity, KitchenRoutingSetRequest } from '@pos/contracts';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';

export function routingResponse(
  row: Prisma.KitchenRoutingCommandGetPayload<Record<string, never>>,
) {
  return {
    locationId: row.locationId,
    productId: row.productId,
    version: row.resultVersion!,
    station: row.stationId
      ? { id: row.stationId, code: row.stationCode!, name: row.stationName! }
      : null,
  };
}

export async function currentRouting(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  productId: string,
) {
  const product = await tx.locationProduct.findFirst({
    where: { organizationId, locationId, productId },
  });
  assert(product, 404, 'Produsul nu există în această locație.');
  const row = await tx.kitchenRoutingCommand.findFirst({
    where: { organizationId, locationId, productId, status: 'SUCCEEDED' },
    orderBy: { resultVersion: 'desc' },
  });
  return row ? routingResponse(row) : { locationId, productId, version: 0, station: null };
}

export async function readRoutingCommand(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  identity: KitchenRoutingIdentity,
) {
  const row = await tx.kitchenRoutingCommand.findFirst({
    where: { organizationId, locationId: identity.locationId, requestKey: identity.requestKey },
  });
  assert(
    !row || (row.productId === identity.productId && row.actorUserId === actor),
    409,
    'Cheia cererii aparține altei operațiuni.',
  );
  return row;
}

export async function setRouting(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  body: KitchenRoutingSetRequest,
) {
  const hash = requestHash({ organizationId, actor, ...body });
  const previous = await readRoutingCommand(tx, organizationId, actor, body);
  if (previous) {
    assert(previous.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date.');
    return { routing: routingResponse(previous), replayed: true };
  }
  const current = await currentRouting(tx, organizationId, body.locationId, body.productId);
  assert(current.version === body.version, 409, 'Rutarea a fost modificată. Reîncărcați.');
  if (body.stationId) {
    const station = await tx.kitchenStation.findFirst({
      where: { organizationId, locationId: body.locationId, id: body.stationId, status: 'ACTIVE' },
    });
    assert(station, 409, 'Selectați o stație activă din această locație.');
  }
  const row = await tx.kitchenRoutingCommand.create({
    data: {
      organizationId,
      locationId: body.locationId,
      productId: body.productId,
      requestKey: body.requestKey,
      actorUserId: actor,
      status: 'SUCCEEDED',
      requestHash: hash,
      expectedVersion: body.version,
      resultVersion: body.version + 1,
      stationId: body.stationId,
    },
  });
  return { routing: routingResponse(row), replayed: false };
}

export async function resolveRouting(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  identity: KitchenRoutingIdentity,
) {
  const previous = await readRoutingCommand(tx, organizationId, actor, identity);
  if (previous) return previous;
  await currentRouting(tx, organizationId, identity.locationId, identity.productId);
  return tx.kitchenRoutingCommand.create({
    data: { organizationId, actorUserId: actor, status: 'RETIRED', ...identity },
  });
}
