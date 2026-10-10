import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
import type { OperationsFixture } from './operations.types';

export async function createTimelineOrder(f: OperationsFixture) {
  return f.txA(async (tx) => {
    const latest = await tx.order.aggregate({
      where: { locationId: f.locationA.id },
      _max: { number: true },
    });
    const order = await tx.order.create({
      data: {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        number: (latest._max.number ?? 0) + 1,
        serviceType: 'TAKEAWAY',
        total: '0',
        clientRequestId: randomUUID(),
        creationRequestHash: 'e'.repeat(64),
        createdByUserId: f.a.user.id,
        updatedByUserId: f.a.user.id,
      },
    });
    const event = await tx.orderStatusEvent.create({
      data: {
        organizationId: order.organizationId,
        locationId: order.locationId,
        orderId: order.id,
        actorUserId: f.a.user.id,
        kind: 'ORDER',
        toStatus: 'DRAFT',
        actorDisplayName: 'Nume falsificat',
        createdAt: new Date('2000-01-01T00:00:00Z'),
      },
    });
    return { order, event };
  });
}

export async function writeTimelineDraft(tx: TenantTransaction, orderId: string) {
  const order = await tx.order.update({
    where: { id: orderId },
    data: { notes: 'Notă sintetică schimbată', version: { increment: 1 } },
  });
  return tx.auditEvent.create({
    data: {
      organizationId: order.organizationId,
      locationId: order.locationId,
      actorUserId: order.updatedByUserId,
      action: 'orders.draft.updated',
      targetType: 'ORDER',
      targetId: order.id,
      outcome: 'SUCCESS',
      requestId: randomUUID(),
      metadata: { orderVersion: 999, previousVersion: 998 },
      actorDisplayName: 'Nume falsificat',
      orderVersion: 999,
      createdAt: new Date('2000-01-01T00:00:00Z'),
    },
  });
}

export async function writeSameTimestampTimeline(tx: TenantTransaction, orderId: string) {
  await tx.$executeRaw`SELECT set_config('app.timeline_test_order',${orderId},true)`;
  // All 52 actual writes share one PostgreSQL statement timestamp across both sources.
  await tx.$executeRaw`DO $fixture$
  DECLARE o public."Order"; i integer;
  BEGIN
    FOR i IN 1..26 LOOP
      UPDATE public."Order" SET notes='Editare sintetică '||i,version=version+1
        WHERE id=current_setting('app.timeline_test_order')::uuid RETURNING * INTO o;
      INSERT INTO public."AuditEvent" (id,"organizationId","locationId","actorUserId",action,"targetType","targetId",outcome,"requestId")
        VALUES(gen_random_uuid(),o."organizationId",o."locationId",o."updatedByUserId",'orders.draft.updated','ORDER',o.id::text,'SUCCESS',gen_random_uuid()::text);
      INSERT INTO public."OrderStatusEvent" (id,"organizationId","locationId","orderId",kind,"fromStatus","toStatus","actorUserId")
        VALUES(gen_random_uuid(),o."organizationId",o."locationId",o.id,'ORDER','DRAFT','DRAFT',o."updatedByUserId");
    END LOOP;
  END $fixture$`;
}
