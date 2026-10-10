import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import { moneySchema } from '../shared/model/money.schema';
import { DELIVERY_ZONE_LIMITS as limits } from './config/delivery-zones.constants';
import { isSimpleDeliveryPolygon } from './delivery-geometry';

export const deliveryCoordinateSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export const deliveryZoneShapeSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('RADIUS'),
      center: deliveryCoordinateSchema,
      radiusMeters: z.number().int().min(1).max(limits.maxRadiusMeters),
    })
    .strict(),
  z
    .object({
      type: z.literal('POLYGON'),
      vertices: z
        .array(deliveryCoordinateSchema)
        .min(3)
        .max(limits.maxVertices)
        .refine(
          isSimpleDeliveryPolygon,
          'Poligonul trebuie să fie simplu, fără puncte repetate, intersecții sau traversarea antimeridianului.',
        ),
    })
    .strict(),
]);
export const deliveryZoneHoursSchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(1).max(7),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      })
      .strict()
      .refine(
        (window) => window.startMinute < window.endMinute,
        'Ora de sfârșit trebuie să urmeze orei de început. Împarte intervalele peste miezul nopții.',
      ),
  )
  .max(limits.maxScheduleWindows)
  .superRefine((windows, context) => {
    for (let i = 0; i < windows.length; i++)
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i]!,
          b = windows[j]!;
        if (a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute)
          context.addIssue({
            code: 'custom',
            path: [j],
            message: 'Intervalele nu se pot suprapune.',
          });
      }
  });
export const deliveryZoneProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    shape: deliveryZoneShapeSchema,
    minimumOrder: moneySchema,
    deliveryFee: moneySchema,
    freeDeliveryFrom: moneySchema.nullable(),
    estimatedMinutes: z.number().int().min(1).max(limits.maxEstimatedMinutes),
    activeHours: deliveryZoneHoursSchema,
    priority: z.number().int().min(0).max(999),
  })
  .strict()
  .refine(
    (profile) =>
      profile.freeDeliveryFrom === null ||
      BigInt(profile.freeDeliveryFrom.replace('.', '')) >=
        BigInt(profile.minimumOrder.replace('.', '')),
    'Pragul de livrare gratuită nu poate fi sub comanda minimă.',
  );
export const deliveryZoneListSchema = z
  .object({
    locationId: idSchema,
    status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();
