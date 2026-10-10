import type { OrderNotification, OrderRealtimeMessage } from '@pos/contracts';
import { ORDER_REALTIME_EVENT_TYPES } from '@pos/contracts';
import type { TenantActorReference } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import { runtime, withTenantTransaction } from '../../../shared/db';
import { loadAccess, scopeFor } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';

function requireLocationRead(access: AccessData, actor: TenantActorReference, locationId: string) {
  assert(
    access.locations.some((location) => location.id === locationId && location.status === 'ACTIVE'),
    403,
    'Locație nepermisă',
  );
  const scope = scopeFor(actor.user.organizationId, { scopeType: 'LOCATION', locationId });
  assert(access.service.canUse(actor.user.id, 'orders.read', scope), 403, 'Abonament nepermis');
  return scope;
}
export async function authorizeOrderSubscription(actor: TenantActorReference, locationId: string) {
  return withTenantTransaction(
    runtime,
    { organizationId: actor.user.organizationId, userId: actor.user.id },
    async (tx) => {
      requireLocationRead(await loadAccess(tx, actor), actor, locationId);
    },
  );
}
export async function readOrderRealtimeMessage(
  actor: TenantActorReference,
  notification: OrderNotification,
): Promise<OrderRealtimeMessage | null> {
  if (actor.user.organizationId !== notification.organizationId) return null;
  return withTenantTransaction(
    runtime,
    { organizationId: actor.user.organizationId, userId: actor.user.id },
    async (tx) => {
      const access = await loadAccess(tx, actor);
      const scope = requireLocationRead(access, actor, notification.locationId);
      const event = await tx.orderRealtimeEvent.findFirst({
        where: {
          id: notification.eventId,
          organizationId: notification.organizationId,
          locationId: notification.locationId,
        },
      });
      if (!event || !ORDER_REALTIME_EVENT_TYPES.some((type) => type === event.type)) return null;
      const order = await tx.order.findFirst({
        where: {
          id: event.orderId,
          organizationId: event.organizationId,
          locationId: event.locationId,
        },
      });
      if (
        !order ||
        ![event.amountSnapshot, order.total].every((amount) =>
          access.service.canUse(actor.user.id, 'orders.read', {
            ...scope,
            amount: amount.toFixed(2),
          }),
        )
      )
        return null;
      return {
        type: event.type as OrderRealtimeMessage['type'],
        topic: 'orders',
        eventId: event.id,
        locationId: event.locationId,
        orderId: event.orderId,
        orderVersion: event.orderVersion,
      };
    },
  );
}
