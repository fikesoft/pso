import type { DeliveryZoneCommand, DeliveryZoneResolution } from '@pos/contracts';
import { deliveryZoneProfileSchema } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { DeliveryZoneCommandRow } from '../../../entities/delivery-zone';
import { deliveryZoneCommandResult, deliveryZoneResponse } from '../../../entities/delivery-zone';
import { assert } from '../../../shared/lib/http';
import { domainHmac } from '../../../shared/lib/sealed-json';
import { DELIVERY_ZONE_COMMAND_DOMAIN } from '../config/delivery-zones.constants';

export async function readDeliveryZoneCommand(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  zoneId: string,
  body: DeliveryZoneResolution,
) {
  const previous = await tx.deliveryZoneCommand.findFirst({
    where: { organizationId, requestKey: body.requestKey },
  });
  if (previous)
    assert(
      previous.zoneId === zoneId &&
        previous.locationId === body.locationId &&
        previous.actorUserId === actor &&
        previous.action === body.action,
      409,
      'Cheia cererii aparține altei operațiuni.',
    );
  return previous;
}
export async function deliveryZoneOperationResponse(
  tx: TenantTransaction,
  command: DeliveryZoneCommandRow,
) {
  if (command.status === 'RETIRED')
    return {
      status: 'RETIRED' as const,
      requestKey: command.requestKey,
      action: command.action,
      zoneId: command.zoneId,
      locationId: command.locationId,
    };
  const zone = await tx.deliveryZone.findFirst({
    where: {
      id: command.zoneId,
      organizationId: command.organizationId,
      locationId: command.locationId,
    },
  });
  assert(zone, 404, 'Zona nu există.');
  return {
    status: 'SUCCEEDED' as const,
    result: deliveryZoneCommandResult(command),
    zone: deliveryZoneResponse(zone),
  };
}
export async function executeDeliveryZoneCommand(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  zoneId: string,
  body: DeliveryZoneCommand,
) {
  const profile = 'profile' in body ? body.profile : undefined;
  const version = 'version' in body ? body.version : undefined;
  const hash = domainHmac(
    DELIVERY_ZONE_COMMAND_DOMAIN,
    JSON.stringify([
      organizationId,
      actor,
      zoneId,
      body.locationId,
      body.requestKey,
      body.action,
      version ?? null,
      profile ?? null,
    ]),
  );
  const previous = await readDeliveryZoneCommand(tx, organizationId, actor, zoneId, body);
  if (previous) {
    assert(
      previous.status === 'SUCCEEDED',
      409,
      'Tentativa a fost retrasă. Inițiați o cerere nouă.',
    );
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date.');
    return { command: previous, replayed: true };
  }
  const zone = await tx.deliveryZone.findFirst({ where: { id: zoneId, organizationId } });
  if (body.action === 'CREATE') assert(!zone, 409, 'Identitatea zonei este deja folosită.');
  else {
    assert(zone && zone.locationId === body.locationId, 404, 'Zona nu există.');
    assert(
      zone.version === version &&
        zone.version < 2147483647 &&
        zone.status === (body.action === 'RESTORE' ? 'ARCHIVED' : 'ACTIVE'),
      409,
      'Zona a fost modificată. Reîncărcați.',
    );
    if (profile)
      assert(
        JSON.stringify(deliveryZoneProfileSchema.parse(zone.profile)) !== JSON.stringify(profile),
        409,
        'Zona conține deja aceste date.',
      );
  }
  const command = await tx.deliveryZoneCommand.create({
    data: {
      organizationId,
      locationId: body.locationId,
      zoneId,
      actorUserId: actor,
      requestKey: body.requestKey,
      action: body.action,
      status: 'SUCCEEDED',
      requestHash: hash,
      expectedVersion: version,
      profile,
    },
  });
  return { command, replayed: false };
}
