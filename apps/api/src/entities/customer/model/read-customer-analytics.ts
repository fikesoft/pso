import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
import { CUSTOMER_ANALYTICS_BATCH_SIZE } from '../config/customer-analytics.constants';
import { createCustomerAnalytics } from './customer-analytics';
import type {
  CustomerAnalyticsReadInput,
  CustomerAnalyticsPayments,
} from './customer-analytics.types';

export async function readCustomerAnalytics(
  tx: TenantTransaction,
  input: CustomerAnalyticsReadInput,
) {
  const [clock] = await tx.$queryRaw<{ asOf: Date }[]>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
  const asOf = clock!.asOf;
  const accumulator = createCustomerAnalytics(asOf, input.locations);
  let after: string | undefined;
  for (;;) {
    const rows = await tx.order.findMany({
      where: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        locationId: { in: input.locations.map((location) => location.id) },
        status: 'COMPLETED',
        createdAt: { lte: asOf },
        ...(after ? { id: { gt: after } } : {}),
      },
      select: { id: true, locationId: true, total: true, createdAt: true },
      orderBy: { id: 'asc' },
      take: CUSTOMER_ANALYTICS_BATCH_SIZE,
    });
    if (!rows.length) break;
    after = rows.at(-1)!.id;
    const authorized = rows.filter((order) =>
      input.canRead(order.locationId, order.total.toFixed(2)),
    );
    const demos = await tx.checkout.findMany({
      where: {
        organizationId: input.organizationId,
        orderId: { in: authorized.map((order) => order.id) },
        mode: 'DEMO',
      },
      select: { orderId: true },
    });
    const demoIds = new Set(demos.map((demo) => demo.orderId));
    const orders = authorized.filter((order) => !demoIds.has(order.id));
    const ids = orders.map((order) => order.id);
    if (ids.length) {
      const items = await tx.orderItem.findMany({
        where: { organizationId: input.organizationId, orderId: { in: ids } },
        select: { orderId: true, productId: true, productName: true, quantity: true },
        orderBy: [{ orderId: 'asc' }, { position: 'asc' }],
      });
      const payments = await tx.$queryRaw<CustomerAnalyticsPayments[]>`
        SELECT o.id AS "orderId", collected.amount::text AS "collectedAmount",
          refunded.amount::text AS "refundedAmount" FROM public."Order" o
        CROSS JOIN LATERAL (SELECT coalesce(sum(p.amount),0.00) AS amount FROM public."Payment" p
          WHERE p."organizationId"=o."organizationId" AND p."orderId"=o.id) collected
        CROSS JOIN LATERAL (SELECT coalesce(sum(r.amount),0.00) AS amount FROM public."PaymentRefund" r
          WHERE r."organizationId"=o."organizationId" AND r."orderId"=o.id) refunded
        WHERE o."organizationId"=${input.organizationId}::uuid
          AND o.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
      const money = new Map(payments.map((row) => [row.orderId, row]));
      for (const order of orders) {
        const financial = money.get(order.id);
        if (!financial) throw new Error('Snapshotul financiar al clientului este incomplet.');
        accumulator.add({
          ...order,
          total: order.total.toFixed(2),
          ...financial,
          items: items
            .filter((item) => item.orderId === order.id)
            .map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity.toFixed(3),
            })),
        });
      }
    }
    if (rows.length < CUSTOMER_ANALYTICS_BATCH_SIZE) break;
  }
  return { asOf: asOf.toISOString(), metrics: accumulator.result() };
}
