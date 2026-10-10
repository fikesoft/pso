import type { TenantTransaction } from '@pos/db';
import type { CourierAcceptance, CourierAcceptanceResolution } from '@pos/contracts';
import { courierAcceptanceResultSchema } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { domainHmac } from '../../../shared/lib/sealed-json';
import { COURIER_ACCEPTANCE_DOMAIN } from '../config/courier-work.constants';
import { requireCourierWork, canReadCourierWork } from './courier-work-access';
import type { CourierAcceptanceRow } from './courier-acceptance.types';
export async function acceptanceContext(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  orderId: string,
  body: CourierAcceptanceResolution,
) {
  const profile = await requireCourierWork(tx, access, actor, body.locationId);
  const order = await tx.order.findFirst({
    where: {
      id: orderId,
      organizationId: access.org.id,
      locationId: body.locationId,
      serviceType: 'DELIVERY',
      deliveryCourierId: actor,
    },
  });
  assert(order, 404, 'Livrarea nu există.');
  assert(canReadCourierWork(access, actor, body.locationId, order.total.toFixed(2)));
  const assignment = await tx.deliveryOperation.findFirst({
    where: {
      id: body.assignmentId,
      organizationId: access.org.id,
      locationId: body.locationId,
      orderId,
      toStatus: 'ASSIGNED',
      courierUserId: actor,
    },
  });
  assert(assignment, 404, 'Atribuirea nu există.');
  return { profile, order, assignment };
}
export async function readAcceptance(
  tx: TenantTransaction,
  organizationId: string,
  actor: string,
  orderId: string,
  body: CourierAcceptanceResolution,
) {
  const previous = await tx.courierAcceptanceCommand.findFirst({
    where: { organizationId, requestKey: body.requestKey },
  });
  if (previous)
    assert(
      previous.actorUserId === actor &&
        previous.orderId === orderId &&
        previous.locationId === body.locationId &&
        previous.assignmentId === body.assignmentId,
      409,
      'Cheia aparține altei acceptări.',
    );
  return previous;
}
export function acceptanceResult(command: CourierAcceptanceRow) {
  return courierAcceptanceResultSchema.parse({
    id: command.id,
    orderId: command.orderId,
    assignmentId: command.assignmentId,
    locationId: command.locationId,
    courierUserId: command.actorUserId,
    requestKey: command.requestKey,
    orderVersion: command.expectedOrderVersion,
    acceptedAt: command.acceptedAt?.toISOString(),
  });
}
export async function executeAcceptance(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  orderId: string,
  body: CourierAcceptance,
) {
  const context = await acceptanceContext(tx, access, actor, orderId, body);
  const hash = domainHmac(
    COURIER_ACCEPTANCE_DOMAIN,
    JSON.stringify([
      access.org.id,
      actor,
      orderId,
      body.locationId,
      body.assignmentId,
      body.requestKey,
      body.orderVersion,
      body.confirmed,
    ]),
  );
  const previous = await readAcceptance(tx, access.org.id, actor, orderId, body);
  if (previous) {
    assert(
      previous.status === 'SUCCEEDED' && previous.requestHash === hash,
      409,
      'Tentativa a fost retrasă sau folosită pentru alte date.',
    );
    return { ...context, command: previous, replayed: true };
  }
  assert(
    context.profile.status === 'ACTIVE' && context.order.deliveryStatus === 'ASSIGNED',
    409,
    'Livrarea nu mai poate fi acceptată.',
  );
  assert(context.order.version === body.orderVersion, 409, 'Comanda s-a modificat. Reîncărcați.');
  const latest = await tx.deliveryOperation.findFirst({
    where: { organizationId: access.org.id, orderId, toStatus: 'ASSIGNED' },
    orderBy: { orderVersion: 'desc' },
  });
  assert(latest?.id === body.assignmentId, 409, 'Atribuirea s-a modificat. Reîncărcați.');
  assert(
    !(await tx.courierAcceptanceCommand.findFirst({
      where: {
        organizationId: access.org.id,
        assignmentId: body.assignmentId,
        status: 'SUCCEEDED',
      },
    })),
    409,
    'Livrarea este deja acceptată.',
  );
  const command = await tx.courierAcceptanceCommand.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      orderId,
      assignmentId: body.assignmentId,
      courierId: context.profile.id,
      actorUserId: actor,
      requestKey: body.requestKey,
      status: 'SUCCEEDED',
      requestHash: hash,
      expectedOrderVersion: body.orderVersion,
    },
  });
  return { ...context, command, replayed: false };
}
