import type { OrderDeliveryFeeCommand } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { domainHmac } from '../../../shared/lib/sealed-json';
import { ORDER_DELIVERY_FEE_COMMAND_DOMAIN } from '../config/delivery-fee.constants';
import { requireOrderPermission } from './order-authorization';
export async function readOrderDeliveryFeeCommand(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  orderId: string,
  requestKey: string,
) {
  const command = await tx.orderDeliveryFeeCommand.findFirst({
    where: { organizationId: access.org.id, requestKey },
  });
  if (command) {
    assert(
      command.orderId === orderId && command.actorUserId === actor,
      409,
      'Cheia cererii aparține altei operațiuni.',
    );
    if (command.total !== null) {
      requireOrderPermission(
        access,
        actor,
        command.locationId,
        'orders.create',
        command.total.toFixed(2),
      );
      requireOrderPermission(
        access,
        actor,
        command.locationId,
        'orders.read',
        command.total.toFixed(2),
      );
    }
  }
  return command;
}
export function orderDeliveryFeeHash(
  organizationId: string,
  actor: string,
  orderId: string,
  body: OrderDeliveryFeeCommand,
) {
  return domainHmac(
    ORDER_DELIVERY_FEE_COMMAND_DOMAIN,
    JSON.stringify([
      organizationId,
      actor,
      orderId,
      body.requestKey,
      body.version,
      body.destination.latitude,
      body.destination.longitude,
      body.zoneId,
      body.zoneVersion,
      body.subtotal,
      body.fee,
      body.total,
    ]),
  );
}
