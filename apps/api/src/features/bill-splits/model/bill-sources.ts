import { readBillItemSources } from './bill-item-sources';
import type {
  BillSplitPreviewRequest,
  BillSplitPreviewDto,
  BillSplitCreateRequest,
} from '@pos/contracts';
import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { visitMemberIds } from '../../../entities/table-visit';
import { distributeBill, distributeBillItems } from '../../../entities/bill-split';
import { assert, HttpError } from '../../../shared/lib/http';
import { requireBillAccess, requireBillOrderRead } from './bill-access';
export async function previewBill(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  input: BillSplitPreviewRequest,
  expected?: Pick<BillSplitCreateRequest, 'sources' | 'visitVersion'>,
): Promise<BillSplitPreviewDto> {
  requireBillAccess(access, actor, input.locationId, input.context);
  const visit =
    input.context.kind === 'VISIT'
      ? await tx.tableVisit.findFirst({
          where: { id: input.context.id, locationId: input.locationId },
        })
      : null;
  if (input.context.kind === 'VISIT') {
    assert(visit, 404, 'Vizita nu există.');
    assert(visit.status === 'OPEN', 409, 'Vizita nu mai este deschisă.');
  }
  const scopeIds = visit
    ? await visitMemberIds(tx, access.org.id, input.locationId, visit.id)
    : [input.context.id];
  const activeSources =
    input.selection === 'UNPLANNED'
      ? await tx.$queryRaw<Array<{ orderId: string }>>`
      SELECT DISTINCT s."orderId" FROM "BillSplitSource" s JOIN "Order" o
      ON (o."organizationId",o."locationId",o.id)=(s."organizationId",s."locationId",s."orderId")
      WHERE s."organizationId"=${access.org.id}::uuid AND s."locationId"=${input.locationId}::uuid
        AND s."isActive" AND ${visit ? Prisma.sql`o."tableVisitId"` : Prisma.sql`o.id`} IN (${Prisma.join(scopeIds.map((id) => Prisma.sql`${id}::uuid`))})`
      : [];
  const orders = await tx.order.findMany({
    where: {
      locationId: input.locationId,
      NOT: { id: { in: activeSources.map((source) => source.orderId) } },
      ...(visit
        ? {
            tableVisitId: {
              in: scopeIds,
            },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
          }
        : { id: input.context.id }),
    },
    orderBy: { id: 'asc' },
    take: 101,
  });
  assert(
    orders.length > 0,
    activeSources.length ? 409 : 404,
    'Nu există comenzi neincluse pentru nota selectată.',
  );
  assert(orders.length <= 100, 409, 'Nota depășește limita de 100 de comenzi.');
  for (const order of orders)
    requireBillOrderRead(access, actor, input.locationId, order.total.toFixed(2));
  const ids = orders.map((order) => order.id);
  assert(
    !(await tx.billSplitSource.findFirst({ where: { orderId: { in: ids }, isActive: true } })),
    409,
    'O comandă este deja inclusă într-o notă împărțită.',
  );
  assert(
    !(await tx.payment.findFirst({ where: { orderId: { in: ids } } })),
    409,
    'Împărțirea se confirmă înainte de prima încasare.',
  );
  assert(
    !(await tx.checkout.findFirst({ where: { orderId: { in: ids } } })),
    409,
    'Nota include o comandă deja finalizată.',
  );
  assert(
    orders.every((order) => ['CONFIRMED', 'IN_PROGRESS', 'READY'].includes(order.status)),
    409,
    'Confirmați toate comenzile înainte de împărțirea notei.',
  );
  const sources = orders.map((order) => ({
    orderId: order.id,
    number: order.number,
    version: order.version,
    amount: order.total.toFixed(2),
  }));
  assert(
    input.division.mode !== 'ITEMS' || orders.every((order) => order.deliveryFee.isZero()),
    409,
    'Nota conține un tarif separat de livrare. Alegeți împărțirea egală sau pe sume pentru a include și tariful.',
  );
  if (expected)
    assert(
      JSON.stringify([...expected.sources].sort((a, b) => a.orderId.localeCompare(b.orderId))) ===
        JSON.stringify(sources.map(({ orderId, version }) => ({ orderId, version }))) &&
        expected.visitVersion === visit?.version,
      409,
      'Nota s-a schimbat. Reîncărcați previzualizarea înainte de confirmare.',
    );
  const total = orders
    .reduce((sum, order) => sum.add(order.total), new Prisma.Decimal(0))
    .toFixed(2);
  requireBillAccess(access, actor, input.locationId, input.context, total);
  const sourceItems = await readBillItemSources(tx, access.org.id, input.locationId, ids);
  let distribution;
  try {
    distribution =
      input.division.mode === 'ITEMS'
        ? distributeBillItems(sourceItems, input.division)
        : distributeBill(sources, input.division);
    assert(distribution.total === total, 409, 'Totalurile articolelor nu corespund notei.');
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : 'Împărțire invalidă.',
      'BILL_SPLIT_INVALID',
    );
  }
  requireBillAccess(access, actor, input.locationId, input.context, distribution.total);
  return {
    locationId: input.locationId,
    context: input.context,
    ...(visit ? { visitVersion: visit.version } : {}),
    currency: 'MDL',
    sources,
    sourceItems,
    ...distribution,
  };
}
