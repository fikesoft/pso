import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { UNSUPPORTED_EMPLOYEE_METRICS } from '../config/profile.constants';
import type { ProfileScope } from './profile.types';

export async function profilePerformance(
  tx: TenantTransaction,
  access: AccessData,
  actorId: string,
  userId: string,
  scope: ProfileScope,
) {
  const canReadAll = (permission: string) =>
    scope.locationIds.length > 0 &&
    scope.locationIds.every((locationId) =>
      access.service.canUse(
        actorId,
        permission,
        scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
      ),
    );
  const canReadOrders = canReadAll('orders.read');
  const canReadSales = canReadAll('reports.sales.read');
  const base = {
    organizationId: access.org.id,
    locationId: { in: scope.locationIds },
  };
  const period = { gte: scope.start, lt: scope.end };
  const [ordersCreated, ordersCancelled, paymentGroups] = await Promise.all([
    canReadOrders
      ? tx.order.count({ where: { ...base, createdByUserId: userId, createdAt: period } })
      : Promise.resolve(null),
    canReadOrders
      ? tx.orderStatusEvent.count({
          where: {
            ...base,
            actorUserId: userId,
            kind: 'ORDER',
            toStatus: 'CANCELLED',
            createdAt: period,
          },
        })
      : Promise.resolve(null),
    canReadSales
      ? tx.payment.groupBy({
          by: ['currency'],
          where: { ...base, confirmedByUserId: userId, createdAt: period },
          _count: { _all: true },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
  ]);
  let averageRows: Array<{ currency: string; orderCount: number; averageOrder: string }> = [];
  if (canReadSales) {
    const ids = Prisma.join(scope.locationIds.map((id) => Prisma.sql`${id}::uuid`));
    averageRows = await tx.$queryRaw<
      Array<{ currency: string; orderCount: number; averageOrder: string }>
    >(Prisma.sql`
      SELECT c.currency, count(*)::integer AS "orderCount",
        round(sum(c.total)/count(*)::numeric,2)::text AS "averageOrder"
      FROM public."Order" o JOIN public."Checkout" c
        ON c."organizationId"=o."organizationId" AND c."orderId"=o.id
      WHERE o."organizationId"=${access.org.id}::uuid
        AND o."locationId" IN (${ids})
        AND o."createdByUserId"=${userId}::uuid
        AND o.status='COMPLETED' AND c.mode='MANUAL'
        AND o."createdAt">=${scope.start} AND o."createdAt"<${scope.end}
      GROUP BY c.currency`);
  }
  const currencies = new Set([
    ...(paymentGroups?.map((row) => row.currency) ?? []),
    ...averageRows.map((row) => row.currency),
  ]);
  const mixedCurrency = currencies.size > 1;
  const currency = canReadSales
    ? mixedCurrency
      ? null
      : ([...currencies][0] ?? access.org.currency)
    : null;
  return {
    ordersCreated,
    ordersCancelled,
    paymentsHandled: paymentGroups
      ? paymentGroups.reduce((total, row) => total + row._count._all, 0)
      : null,
    revenueHandled: paymentGroups
      ? mixedCurrency
        ? null
        : (paymentGroups[0]?._sum.amount?.toFixed(2) ?? '0.00')
      : null,
    averageOrder: canReadSales && !mixedCurrency ? (averageRows[0]?.averageOrder ?? null) : null,
    averageOrderOrders: canReadSales
      ? averageRows.reduce((total, row) => total + row.orderCount, 0)
      : null,
    currency,
    refunds: null,
    discounts: null,
    tips: null,
    bonuses: null,
    penalties: null,
    unsupported: UNSUPPORTED_EMPLOYEE_METRICS,
  };
}
