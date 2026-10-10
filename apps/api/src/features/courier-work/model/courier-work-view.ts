import { decryptDeliveryProof } from '../../../entities/delivery-proof';
import type { TenantTransaction } from '@pos/db';
import { courierWorkItemSchema } from '@pos/contracts';
import { orderResponse } from '../../../entities/order';
import type { StoredOrder } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
export async function courierWorkView(tx: TenantTransaction, order: StoredOrder) {
  const assignment = await tx.deliveryOperation.findFirst({
    where: {
      organizationId: order.organizationId,
      locationId: order.locationId,
      orderId: order.id,
      toStatus: 'ASSIGNED',
    },
    orderBy: { orderVersion: 'desc' },
  });
  assert(
    assignment && assignment.courierUserId === order.deliveryCourierId,
    409,
    'Atribuirea livrării nu mai este disponibilă.',
  );
  const data = await orderResponse(tx, order, true);
  const acceptance = await tx.courierAcceptanceCommand.findFirst({
    where: {
      organizationId: order.organizationId,
      assignmentId: assignment.id,
      status: 'SUCCEEDED',
    },
  });
  const proof = await tx.deliveryProof.findFirst({
    where: {
      organizationId: order.organizationId,
      locationId: order.locationId,
      orderId: order.id,
      assignmentId: assignment.id,
    },
    orderBy: { confirmedAt: 'desc' },
  });
  return courierWorkItemSchema.parse({
    deliveryProof: proof
      ? {
          recipientName: decryptDeliveryProof(proof, proof.privateDataEncrypted).recipientName,
          confirmedAt: proof.confirmedAt.toISOString(),
        }
      : null,
    orderId: order.id,
    locationId: order.locationId,
    orderVersion: order.version,
    assignmentId: assignment.id,
    courierUserId: order.deliveryCourierId,
    number: order.number,
    deliveryStatus: data.deliveryStatus,
    kitchenStatus: data.kitchenStatus,
    packingStatus: data.packingStatus,
    customer: data.customer ?? null,
    deliveryAddress: data.deliveryAddress ?? null,
    notes: order.notes,
    total: data.total,
    outstandingAmount: data.paymentSummary.outstandingAmount,
    currency: order.currency,
    assignedAt: assignment.createdAt.toISOString(),
    acceptedAt: acceptance?.acceptedAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
  });
}
