import { z } from 'zod';
import { customerRfmSchema } from './customer-rfm.schema';
import { idSchema } from '../shared/model/identity.schema';

export const customerAnalyticsQuerySchema = z.discriminatedUnion('scopeType', [
  z.object({ scopeType: z.literal('LOCATION'), locationId: idSchema }).strict(),
  z.object({ scopeType: z.literal('ORGANIZATION') }).strict(),
]);
const aggregateMoneySchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.\d{2}$/)
  .max(80);
const aggregateQuantitySchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.\d{3}$/)
  .max(80);
const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const dateSchema = z.iso.datetime();
export const customerAnalyticsMetricsSchema = z
  .object({
    completedOrders: countSchema,
    orderValue: aggregateMoneySchema,
    collectedAmount: aggregateMoneySchema,
    refundedAmount: aggregateMoneySchema,
    totalSpent: aggregateMoneySchema,
    averageOrderValue: aggregateMoneySchema.nullable(),
    firstOrderAt: dateSchema.nullable(),
    lastOrderAt: dateSchema.nullable(),
    ordersLast30Days: countSchema,
    averageDaysBetweenOrders: aggregateMoneySchema.nullable(),
    favoriteProducts: z
      .array(
        z
          .object({
            productId: idSchema,
            productName: z.string(),
            quantity: aggregateQuantitySchema,
            orderCount: countSchema,
          })
          .strict(),
      )
      .max(5),
    favoriteLocation: z
      .object({
        locationId: idSchema,
        name: z.string(),
        orderCount: countSchema,
        totalSpent: aggregateMoneySchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
export const customerAnalyticsResponseSchema = z
  .object({
    customerId: idSchema,
    timezone: z.string().min(1).max(100),
    scope: customerAnalyticsQuerySchema,
    asOf: dateSchema,
    locations: z.array(z.object({ id: idSchema, name: z.string() }).strict()),
    metrics: customerAnalyticsMetricsSchema,
    rfm: customerRfmSchema,
  })
  .strict();
