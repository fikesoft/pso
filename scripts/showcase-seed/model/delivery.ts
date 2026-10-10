import { withTenantTransaction } from '../../../packages/db/src/index';
import { STAFF_PROFILES } from '../config/staff.constants';
import { seedKey } from './record';
import type { OrderResult, SeedClients, SeedLocationContext } from './seed.types';

export async function seedDelivery(
  clients: SeedClients,
  context: SeedLocationContext,
  orderId: string,
) {
  const { record, references, locationIndex, operator, courier } = context;
  let { order } = await operator.call<OrderResult>(`/orders/${orderId}`);
  if (order.serviceType !== 'DELIVERY' || order.deliveryStatus === 'DELIVERED') return;
  const courierUser = record.users.find(
    (u) => u.location === locationIndex && STAFF_PROFILES[u.profile]!.login === 'curier',
  )!;
  if (order.deliveryStatus === 'WAITING_COURIER') {
    ({ order } = await operator.call<OrderResult>(`/orders/${orderId}/delivery`, 'POST', {
      status: 'ASSIGNED',
      version: order.version,
      courierUserId: courierUser.id,
      requestKey: seedKey(record, `delivery-assign:${orderId}`),
    }));
  }
  if (order.deliveryStatus === 'ASSIGNED') {
    const assignment = await withTenantTransaction(
      clients.runtime,
      { organizationId: references.organizationId },
      (tx) =>
        tx.deliveryOperation.findFirstOrThrow({
          where: { orderId, toStatus: 'ASSIGNED' },
          orderBy: { orderVersion: 'desc' },
        }),
    );
    await courier.call(`/courier-work/${orderId}/accept`, 'POST', {
      locationId: order.locationId,
      assignmentId: assignment.id,
      orderVersion: assignment.orderVersion,
      confirmed: true,
      requestKey: seedKey(record, `delivery-accept:${orderId}`),
    });
  }
  const stages = ['ASSIGNED', 'PICKED_UP', 'DELIVERING', 'DELIVERED'];
  const currentStage = stages.indexOf(order.deliveryStatus ?? '');
  if (currentStage < 0) throw new Error('Stare de livrare incompatibilă cu seedul.');
  for (const status of stages.slice(currentStage + 1)) {
    ({ order } = await courier.call<OrderResult>(`/orders/${orderId}/delivery`, 'POST', {
      status,
      version: order.version,
      requestKey: seedKey(record, `delivery:${orderId}:${status}`),
      ...(status === 'DELIVERED'
        ? {
            proof: {
              recipientName: 'Destinatar DEMO sintetic',
              confirmed: true,
              signature: [
                [
                  { x: 0.1, y: 0.2 },
                  { x: 0.5, y: 0.6 },
                  { x: 0.9, y: 0.2 },
                ],
              ],
            },
          }
        : {}),
    }));
  }
}
