import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
import type { BillSplitListRequest, BillSplitListResponse } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { visitMemberIds } from '../../../entities/table-visit';
import { assert } from '../../../shared/lib/http';
import { requireBillAccess, requireBillOrderRead } from './bill-access';
import { readBill } from './bill-response';
export async function listBills(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  input: BillSplitListRequest,
): Promise<BillSplitListResponse> {
  const context = { kind: input.contextKind, id: input.contextId };
  requireBillAccess(access, actor, input.locationId, context);
  let members = [input.contextId];
  if (input.contextKind === 'VISIT') {
    assert(
      await tx.tableVisit.findFirst({
        where: { id: input.contextId, locationId: input.locationId },
      }),
      404,
      'Vizita nu există.',
    );
    members = await visitMemberIds(tx, access.org.id, input.locationId, input.contextId);
  } else {
    const order = await tx.order.findFirst({
      where: { id: input.contextId, locationId: input.locationId },
    });
    assert(order, 404, 'Comanda nu există.');
    requireBillOrderRead(access, actor, input.locationId, order.total.toFixed(2));
  }
  const ids = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT b.id FROM "BillSplit" b WHERE b."organizationId"=${access.org.id}::uuid AND b."locationId"=${input.locationId}::uuid
      ${input.cursor ? Prisma.sql`AND b.id>${input.cursor}::uuid` : Prisma.empty}
      AND EXISTS (SELECT 1 FROM "BillSplitSource" s JOIN "Order" o
        ON (o."organizationId",o."locationId",o.id)=(s."organizationId",s."locationId",s."orderId")
        WHERE (s."organizationId",s."locationId",s."splitId")=(b."organizationId",b."locationId",b.id)
        AND ${input.contextKind === 'VISIT' ? Prisma.sql`o."tableVisitId"` : Prisma.sql`o.id`} IN (${Prisma.join(members.map((id) => Prisma.sql`${id}::uuid`))}))
    ORDER BY b.id LIMIT 11`;
  const page = ids.slice(0, 10),
    splits = [];
  for (const row of page) splits.push(await readBill(tx, access, actor, input.locationId, row.id));
  return { splits, nextCursor: ids.length > 10 ? page.at(-1)!.id : null };
}
