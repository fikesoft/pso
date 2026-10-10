import { z } from 'zod';
import { idSchema } from '../shared/validation';
import { KITCHEN_ALERT_MAX_SECONDS, KITCHEN_ALERT_TARGETS } from './config/alerts.constants';

export const kitchenAlertScopeSchema = z.discriminatedUnion('scopeType', [
  z.object({ scopeType: z.literal('ORGANIZATION') }).strict(),
  z.object({ scopeType: z.literal('LOCATION'), locationId: idSchema }).strict(),
]);

export const kitchenAlertTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(KITCHEN_ALERT_TARGETS[0]) }).strict(),
  z.object({ kind: z.literal(KITCHEN_ALERT_TARGETS[1]), stationId: idSchema }).strict(),
  z.object({ kind: z.literal(KITCHEN_ALERT_TARGETS[2]), categoryId: idSchema }).strict(),
  z.object({ kind: z.literal(KITCHEN_ALERT_TARGETS[3]), productId: idSchema }).strict(),
]);

export const kitchenAlertThresholdsSchema = z
  .object({
    warningSeconds: z.number().int().min(1).max(KITCHEN_ALERT_MAX_SECONDS),
    criticalSeconds: z.number().int().min(1).max(KITCHEN_ALERT_MAX_SECONDS),
  })
  .strict()
  .refine((value) => value.warningSeconds < value.criticalSeconds, {
    path: ['criticalSeconds'],
    message: 'Pragul critic trebuie să fie mai mare decât pragul de avertizare.',
  });

export const kitchenAlertIdentitySchema = z
  .object({ scope: kitchenAlertScopeSchema, target: kitchenAlertTargetSchema })
  .strict()
  .refine((value) => value.target.kind !== 'STATION' || value.scope.scopeType === 'LOCATION', {
    path: ['scope'],
    message: 'Regula unei stații necesită locația explicită.',
  });

export const kitchenAlertSetSchema = kitchenAlertIdentitySchema
  .safeExtend({
    requestKey: idSchema,
    version: z.number().int().min(0).max(2147483646),
    thresholds: kitchenAlertThresholdsSchema.nullable(),
  })
  .strict();

export const kitchenAlertCommandIdentitySchema = kitchenAlertIdentitySchema
  .safeExtend({ requestKey: idSchema })
  .strict();

export const kitchenAlertOptionsSchema = z
  .object({
    scope: kitchenAlertScopeSchema,
    kind: z.enum(['STATION', 'CATEGORY', 'PRODUCT']),
    search: z.string().trim().max(80).default(''),
    cursor: idSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((value) => value.kind !== 'STATION' || value.scope.scopeType === 'LOCATION', {
    path: ['scope'],
    message: 'Stațiile necesită o locație.',
  });
