import { deliveryProofRequestHash } from '../../../entities/delivery-proof';
import { requireDeliveryProof, saveDeliveryProof } from './delivery-proof';
import type { TenantTransaction } from '@pos/db';
import type { Request } from 'express';
import { DELIVERY_TRANSITIONS } from '@pos/contracts';
import type { DeliveryCommand, DeliveryStatus } from '@pos/contracts';
import {
  effectiveKitchenStatus,
  effectiveOrderStatus,
  orderResponse,
} from '../../../entities/order';
import { audit } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import type { TenantAuthState } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { deliveryAccess } from './delivery-access';
import { deliveryOperationResponse } from './operation-response';
import {
  courierProfileAllowsAssignment,
  courierHasAcceptedAssignment,
} from '../../../entities/courier';

export async function executeDelivery(
  tx: TenantTransaction,
  access: AccessData,
  auth: TenantAuthState,
  req: Request,
  orderId: string,
  body: DeliveryCommand,
) {
  const current = await tx.order.findUnique({ where: { id: orderId } });
  assert(current, 404, 'Comanda nu există');
  const rights = deliveryAccess(access, auth.user.id, current);
  const managerial = body.status === 'ASSIGNED' || body.status === 'WAITING_COURIER';
  assert(rights.canAssign || (!managerial && rights.canUpdate));
  const hash = (body.proof ? deliveryProofRequestHash : requestHash)({
    orderId,
    action: 'DELIVERY',
    ...body,
  });
  const previous = await tx.deliveryOperation.findFirst({
    where: { locationId: current.locationId, requestKey: body.requestKey },
  });
  if (previous) {
    assert(
      previous.orderId === orderId &&
        previous.requestHash === hash &&
        previous.actorUserId === auth.user.id,
      409,
      'Cheia cererii a fost folosită pentru alte date',
    );
    return {
      order: await orderResponse(tx, current),
      operation: deliveryOperationResponse(previous),
    };
  }
  assert(
    !(await tx.deliveryRequestRetirement.findFirst({
      where: {
        organizationId: access.org.id,
        locationId: current.locationId,
        requestKey: body.requestKey,
      },
    })),
    409,
    'Tentativa de livrare a fost retrasă definitiv.',
  );
  assert(current.version === body.version, 409, 'Comanda a fost modificată. Reîncărcați.');
  const state = effectiveOrderStatus(current.status, current.kitchenStatus);
  assert(
    current.serviceType === 'DELIVERY' && state !== 'DRAFT' && state !== 'CANCELLED',
    409,
    'Livrarea cere o comandă confirmată, de tip Livrare, neanulată',
  );
  const checkout = await tx.checkout.findFirst({ where: { orderId } });
  assert(checkout?.mode !== 'DEMO', 409, 'Comenzile DEMO nu pot fi livrate');
  const before = (current.deliveryStatus ?? 'WAITING_COURIER') as DeliveryStatus;
  const allowed: readonly string[] = DELIVERY_TRANSITIONS[before];
  assert(allowed.includes(body.status), 409, 'Tranziția livrării nu este permisă');
  assert(before !== body.status || body.reason, 400, 'Reatribuirea cere un motiv');
  if (['PICKED_UP', 'DELIVERING', 'DELIVERED'].includes(body.status))
    assert(
      (state === 'READY' || state === 'COMPLETED') && current.kitchenStatus === 'READY',
      409,
      'Comanda trebuie să fie preparată și verificată înainte de preluare',
    );
  if (body.courierUserId) {
    assert(
      await courierProfileAllowsAssignment(
        tx,
        access.org.id,
        current.locationId,
        body.courierUserId,
      ),
      409,
      'Curierul este offline, în pauză, arhivat sau la capacitatea maximă.',
    );
    assert(
      rights.eligible(body.courierUserId),
      403,
      'Curierul trebuie să aibă acces și drept de livrare în această locație',
    );
    assert(
      body.courierUserId !== current.deliveryCourierId,
      409,
      'Selectați un alt curier pentru reatribuire',
    );
  }
  if (body.status === 'PICKED_UP')
    assert(
      await courierHasAcceptedAssignment(
        tx,
        access.org.id,
        current.locationId,
        orderId,
        current.deliveryCourierId,
      ),
      409,
      'Curierul trebuie să accepte atribuirea înainte de preluare.',
    );
  await requireDeliveryProof(tx, current, auth.user.id, body);
  const operation = await tx.deliveryOperation.create({
    data: {
      organizationId: access.org.id,
      locationId: current.locationId,
      orderId,
      requestKey: body.requestKey,
      requestHash: hash,
      orderVersion: current.version + 1,
      toStatus: body.status,
      courierUserId: body.courierUserId,
      actorUserId: auth.user.id,
      reason: body.reason,
    },
  });
  await saveDeliveryProof(
    tx,
    {
      organizationId: access.org.id,
      locationId: current.locationId,
      orderId,
      operationId: operation.id,
      actorUserId: auth.user.id,
    },
    body,
  );
  const order = await tx.order.update({
    where: { id: orderId, version: current.version },
    data: {
      version: { increment: 1 },
      updatedByUserId: auth.user.id,
      status: state,
      kitchenStatus: effectiveKitchenStatus(current.kitchenStatus),
      deliveryStatus: operation.toStatus,
      deliveryCourierId: operation.courierUserId,
      deliveryCourierName: operation.courierName,
    },
  });
  await tx.orderStatusEvent.create({
    data: {
      organizationId: access.org.id,
      locationId: order.locationId,
      orderId,
      kind: 'DELIVERY',
      fromStatus: operation.fromStatus,
      toStatus: operation.toStatus,
      actorUserId: operation.actorUserId,
      reason: operation.reason,
      orderVersion: operation.orderVersion,
      requestKey: operation.requestKey,
      requestHash: operation.requestHash,
    },
  });
  await audit(
    tx,
    auth,
    req,
    'delivery.updated',
    'DELIVERY_OPERATION',
    operation.id,
    order.locationId,
  );
  return { order: await orderResponse(tx, order), operation: deliveryOperationResponse(operation) };
}
