import type { TenantTransaction } from '@pos/db';
import type { DeliveryCommand } from '@pos/contracts';
import { encryptDeliveryProof } from '../../../entities/delivery-proof';
import type { DeliveryProofContext } from '../../../entities/delivery-proof';
import type { StoredOrder } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
export async function requireDeliveryProof(
  tx: TenantTransaction,
  order: StoredOrder,
  actorUserId: string,
  body: DeliveryCommand,
) {
  if (body.status !== 'DELIVERED') return;
  const profile = order.deliveryCourierId
    ? await tx.courier.findFirst({
        where: {
          organizationId: order.organizationId,
          locationId: order.locationId,
          userId: order.deliveryCourierId,
        },
      })
    : null;
  assert(
    !profile || body.proof,
    400,
    'Confirmați destinatarul și semnătura pentru predarea livrării.',
  );
  if (body.proof)
    assert(
      order.deliveryCourierId === actorUserId,
      403,
      'Dovada se înregistrează de curierul atribuit.',
    );
}
export async function saveDeliveryProof(
  tx: TenantTransaction,
  context: Omit<DeliveryProofContext, 'assignmentId'>,
  body: DeliveryCommand,
) {
  if (!body.proof) return;
  const assignment = await tx.deliveryOperation.findFirst({
    where: {
      organizationId: context.organizationId,
      locationId: context.locationId,
      orderId: context.orderId,
      toStatus: 'ASSIGNED',
    },
    orderBy: { orderVersion: 'desc' },
  });
  assert(assignment, 409, 'Atribuirea livrării nu mai este disponibilă.');
  const scope = { ...context, assignmentId: assignment.id };
  await tx.deliveryProof.create({
    data: { ...scope, privateDataEncrypted: encryptDeliveryProof(scope, body.proof) },
  });
}
