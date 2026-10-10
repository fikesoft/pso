import { rejectRetiredPlan } from './plan-command';
import type { BillSplitVoidRequest } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { readBill } from './bill-response';
export async function voidBill(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  splitId: string,
  body: BillSplitVoidRequest,
) {
  const split = await readBill(tx, access, actor, body.locationId, splitId);
  await rejectRetiredPlan(tx, access.org.id, actor, {
    kind: 'VOID',
    locationId: body.locationId,
    requestKey: body.requestKey,
    splitId,
  });
  const hash = requestHash({ organizationId: access.org.id, actor, splitId, ...body });
  const previous = await tx.billSplitVoid.findFirst({
    where: { locationId: body.locationId, requestKey: body.requestKey },
  });
  if (previous) {
    assert(
      previous.splitId === splitId &&
        previous.actorUserId === actor &&
        previous.requestHash === hash,
      409,
      'Cheia aparține altei anulări.',
    );
    return { split, replayed: true };
  }
  assert(split.status === 'ACTIVE', 409, 'Împărțirea notei a fost deja anulată.');
  for (const source of split.sources)
    await tx.$executeRaw`SELECT public.prepare_bill_order(${access.org.id}::uuid,${body.locationId}::uuid,${source.orderId}::uuid)`;
  assert(
    !(await tx.payment.findFirst({
      where: { orderId: { in: split.sources.map((source) => source.orderId) } },
    })),
    409,
    'Anularea împărțirii este permisă numai înainte de prima încasare.',
  );
  await tx.billSplitVoid.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      splitId,
      requestKey: body.requestKey,
      requestHash: hash,
      actorUserId: actor,
      reason: body.reason,
    },
  });
  return { split: await readBill(tx, access, actor, body.locationId, splitId), replayed: false };
}
