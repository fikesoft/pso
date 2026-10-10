import type { OrderDeliveryFeePreview } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { StoredOrder } from '../../../entities/order';
import type { AccessData } from '../../../entities/tenant-access';
import { visibleLocations } from '../../../entities/tenant-access';
import { calculateDeliveryFee, deliveryZoneResponse } from '../../../entities/delivery-zone';
import { assert } from '../../../shared/lib/http';
import { requireOrderPermission } from './order-authorization';
export async function requireDeliveryFeeOrder(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  id: string,
) {
  const order = await tx.order.findUnique({ where: { id } });
  assert(
    order && visibleLocations(access, actor).some((location) => location.id === order.locationId),
    404,
    'Comanda nu există.',
  );
  requireOrderPermission(access, actor, order.locationId, 'orders.read', order.total.toFixed(2));
  requireOrderPermission(access, actor, order.locationId, 'orders.create', order.total.toFixed(2));
  return order;
}
export async function orderDeliveryFeePreview(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  order: StoredOrder,
  body: OrderDeliveryFeePreview,
) {
  assert(
    order.status === 'DRAFT' && order.serviceType === 'DELIVERY' && order.deliveryAddressHash,
    409,
    'Tariful necesită o ciornă de livrare cu adresă.',
  );
  assert(order.version === body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
  const location = visibleLocations(access, actor).find((value) => value.id === order.locationId)!;
  const [clock] = await tx.$queryRaw<{ asOf: Date }[]>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
  const sum = await tx.orderItem.aggregate({
    where: { organizationId: order.organizationId, orderId: order.id },
    _sum: { lineTotal: true },
  });
  const zones = await tx.deliveryZone.findMany({
    where: { organizationId: order.organizationId, locationId: order.locationId },
  });
  const result = zones.length
    ? calculateDeliveryFee({
        zones: zones.map(deliveryZoneResponse),
        destination: body.destination,
        subtotal: sum._sum.lineTotal?.toFixed(2) ?? '0.00',
        timezone: location.timezone,
        asOf: clock!.asOf,
      })
    : { status: 'NOT_CONFIGURED' as const };
  if (result.status === 'AVAILABLE') {
    requireOrderPermission(access, actor, order.locationId, 'orders.create', result.total);
    requireOrderPermission(access, actor, order.locationId, 'orders.read', result.total);
  }
  return {
    orderId: order.id,
    version: order.version,
    locationId: location.id,
    timezone: location.timezone,
    asOf: clock!.asOf.toISOString(),
    result,
  };
}
