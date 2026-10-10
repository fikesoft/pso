import { rejectRetiredPlan } from './plan-command';
import type { BillSplitCreateRequest } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireBillAccess } from './bill-access';
import { previewBill } from './bill-sources';
import { readBill } from './bill-response';
export async function createBill(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  body: BillSplitCreateRequest,
) {
  requireBillAccess(access, actor, body.locationId, body.context);
  await rejectRetiredPlan(tx, access.org.id, actor, {
    kind: 'CREATE',
    locationId: body.locationId,
    requestKey: body.requestKey,
    context: body.context,
  });
  const sources = [...body.sources].sort((a, b) => a.orderId.localeCompare(b.orderId));
  const division =
    body.division.mode === 'ITEMS'
      ? {
          ...body.division,
          parts: body.division.parts.map((part) => ({
            items: [...part.items].sort((a, b) => a.orderItemId.localeCompare(b.orderItemId)),
          })),
        }
      : body.division;
  const hash = requestHash({ organizationId: access.org.id, actor, ...body, division, sources });
  const previous = await tx.billSplit.findFirst({
    where: { locationId: body.locationId, requestKey: body.requestKey },
  });
  if (previous) {
    assert(
      previous.actorUserId === actor && previous.requestHash === hash,
      409,
      'Cheia cererii aparține altei împărțiri.',
    );
    return {
      split: await readBill(tx, access, actor, body.locationId, previous.id),
      replayed: true,
    };
  }
  const initial = await previewBill(tx, access, actor, body, body);
  for (const source of initial.sources)
    await tx.$executeRaw`SELECT public.prepare_bill_order(${access.org.id}::uuid,${body.locationId}::uuid,${source.orderId}::uuid)`;
  if (body.context.kind === 'VISIT')
    await tx.$executeRaw`SELECT public.prepare_table_visit(${access.org.id}::uuid,${body.locationId}::uuid,${body.context.id}::uuid)`;
  const preview = await previewBill(tx, access, actor, body, body);
  assert(
    JSON.stringify(sources) ===
      JSON.stringify(preview.sources.map(({ orderId, version }) => ({ orderId, version }))) &&
      body.visitVersion === preview.visitVersion,
    409,
    'Nota s-a schimbat. Reîncărcați previzualizarea înainte de confirmare.',
  );
  const split = await tx.billSplit.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      actorUserId: actor,
      requestKey: body.requestKey,
      requestHash: hash,
      scopeType: body.context.kind,
      targetOrderId: body.context.kind === 'ORDER' ? body.context.id : null,
      targetVisitId: body.context.kind === 'VISIT' ? body.context.id : null,
      mode: body.division.mode,
      partCount: preview.parts.length,
      sourceCount: preview.sources.length,
      total: preview.total,
      currency: preview.currency,
    },
  });
  const scope = { organizationId: access.org.id, locationId: body.locationId, splitId: split.id };
  for (const source of preview.sources)
    await tx.billSplitSource.create({
      data: {
        ...scope,
        orderId: source.orderId,
        orderVersion: source.version,
        amount: source.amount,
      },
    });
  if (body.division.mode === 'ITEMS')
    await tx.billSplitItem.createMany({
      data: preview.sourceItems!.map(({ orderId, orderItemId, quantity, amount }) => ({
        ...scope,
        orderId,
        orderItemId,
        quantity,
        amount,
      })),
    });
  for (const row of preview.parts) {
    const part = await tx.billPart.create({
      data: { ...scope, position: row.position, amount: row.amount },
    });
    if (body.division.mode === 'ITEMS')
      await tx.billPartItem.createMany({
        data: row.items!.map((item) => ({ ...scope, partId: part.id, ...item })),
      });
    await tx.billPartAllocation.createMany({
      data: row.allocations.map((allocation) => ({ ...scope, partId: part.id, ...allocation })),
    });
  }
  return { split: await readBill(tx, access, actor, body.locationId, split.id), replayed: false };
}
