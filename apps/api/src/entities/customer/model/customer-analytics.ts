import { Prisma } from '@pos/db';
import type { CustomerAnalyticsMetrics } from '@pos/contracts';
import {
  CUSTOMER_ANALYTICS_DAY_MS,
  CUSTOMER_ANALYTICS_RECENT_DAYS,
  CUSTOMER_ANALYTICS_FAVORITES_LIMIT,
} from '../config/customer-analytics.constants';
import type {
  CustomerAnalyticsOrder,
  CustomerAnalyticsProduct,
  CustomerAnalyticsLocation,
} from './customer-analytics.types';

export function createCustomerAnalytics(asOf: Date, locations: { id: string; name: string }[]) {
  const Decimal = Prisma.Decimal.clone({ precision: 80, rounding: Prisma.Decimal.ROUND_HALF_UP });
  let completedOrders = 0,
    ordersLast30Days = 0;
  let orderValue = new Decimal(0),
    collectedAmount = new Decimal(0),
    refundedAmount = new Decimal(0);
  let first: number | null = null,
    last: number | null = null;
  const products = new Map<string, CustomerAnalyticsProduct>();
  const places = new Map<string, CustomerAnalyticsLocation>(
    locations.map((location) => [
      location.id,
      {
        locationId: location.id,
        name: location.name,
        orderCount: 0,
        totalSpent: new Decimal(0),
      },
    ]),
  );
  function add(order: CustomerAnalyticsOrder) {
    const createdAt = order.createdAt.getTime();
    const place = places.get(order.locationId);
    if (!place || !Number.isFinite(createdAt) || createdAt > asOf.getTime())
      throw new Error('Comanda nu aparține snapshotului analitic.');
    const total = new Decimal(order.total),
      collected = new Decimal(order.collectedAmount),
      refunded = new Decimal(order.refundedAmount);
    if (
      total.isNegative() ||
      refunded.isNegative() ||
      collected.isNegative() ||
      refunded.gt(collected)
    )
      throw new Error('Date financiare analitice inconsistente.');
    completedOrders++;
    orderValue = orderValue.plus(total);
    collectedAmount = collectedAmount.plus(collected);
    refundedAmount = refundedAmount.plus(refunded);
    first = first === null ? createdAt : Math.min(first, createdAt);
    last = last === null ? createdAt : Math.max(last, createdAt);
    if (createdAt >= asOf.getTime() - CUSTOMER_ANALYTICS_RECENT_DAYS * CUSTOMER_ANALYTICS_DAY_MS)
      ordersLast30Days++;
    place.orderCount++;
    place.totalSpent = place.totalSpent.plus(collected.minus(refunded));
    const seen = new Set<string>();
    for (const item of order.items) {
      const previous = products.get(item.productId);
      const value = previous ?? {
        productId: item.productId,
        productName: item.productName,
        quantity: new Decimal(0),
        orderCount: 0,
        latestAt: createdAt,
        latestOrderId: order.id,
      };
      value.quantity = value.quantity.plus(item.quantity);
      if (!seen.has(item.productId)) value.orderCount++;
      seen.add(item.productId);
      if (
        createdAt > value.latestAt ||
        (createdAt === value.latestAt && order.id > value.latestOrderId)
      ) {
        value.productName = item.productName;
        value.latestAt = createdAt;
        value.latestOrderId = order.id;
      }
      products.set(item.productId, value);
    }
  }
  function result(): CustomerAnalyticsMetrics {
    const favoriteLocation = [...places.values()]
      .filter((place) => place.orderCount > 0)
      .sort(
        (a, b) =>
          b.orderCount - a.orderCount ||
          b.totalSpent.comparedTo(a.totalSpent) ||
          a.locationId.localeCompare(b.locationId),
      )[0];
    return {
      completedOrders,
      orderValue: orderValue.toFixed(2),
      collectedAmount: collectedAmount.toFixed(2),
      refundedAmount: refundedAmount.toFixed(2),
      totalSpent: collectedAmount.minus(refundedAmount).toFixed(2),
      averageOrderValue: completedOrders ? orderValue.div(completedOrders).toFixed(2) : null,
      firstOrderAt: first === null ? null : new Date(first).toISOString(),
      lastOrderAt: last === null ? null : new Date(last).toISOString(),
      ordersLast30Days,
      averageDaysBetweenOrders:
        completedOrders > 1
          ? new Decimal(last! - first!)
              .div(CUSTOMER_ANALYTICS_DAY_MS)
              .div(completedOrders - 1)
              .toFixed(2)
          : null,
      favoriteProducts: [...products.values()]
        .sort(
          (a, b) =>
            b.quantity.comparedTo(a.quantity) ||
            b.orderCount - a.orderCount ||
            a.productId.localeCompare(b.productId),
        )
        .slice(0, CUSTOMER_ANALYTICS_FAVORITES_LIMIT)
        .map(({ productId, productName, quantity, orderCount }) => ({
          productId,
          productName,
          quantity: quantity.toFixed(3),
          orderCount,
        })),
      favoriteLocation: favoriteLocation
        ? {
            locationId: favoriteLocation.locationId,
            name: favoriteLocation.name,
            orderCount: favoriteLocation.orderCount,
            totalSpent: favoriteLocation.totalSpent.toFixed(2),
          }
        : null,
    };
  }
  return { add, result };
}
