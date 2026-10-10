import { z } from 'zod';
import { idSchema } from '../shared';
const coordinateSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(?:\.\d{1,6})?$/)
    .refine((value) => {
      const coordinate = Number(value);
      return coordinate >= minimum && coordinate <= maximum;
    });
const businessHoursWindowSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine((window) => window.opensAt !== window.closesAt);
const businessHoursSchema = z
  .array(businessHoursWindowSchema)
  .max(7)
  .refine(
    (windows) => new Set(windows.map((window) => window.day)).size === windows.length,
    'Este permis un singur interval pe zi.',
  );
export { businessHoursWindowSchema, businessHoursSchema };
const timezoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('ro', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Fus orar IANA nevalid.');
export const createLocationSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(30)
      .regex(/^[A-Z0-9_-]+$/),
    address: z.string().trim().max(250).optional(),
    brandId: idSchema.nullable().optional(),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
    latitude: coordinateSchema(-90, 90).nullable().optional(),
    longitude: coordinateSchema(-180, 180).nullable().optional(),
    businessHours: businessHoursSchema.optional(),
    timezone: timezoneSchema.default('Europe/Chisinau'),
  })
  .strict()
  .refine((location) => (location.latitude == null) === (location.longitude == null), {
    message: 'Latitudinea și longitudinea se completează împreună.',
  });
export const updateLocationSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    address: z.string().trim().max(250).nullable().optional(),
    timezone: timezoneSchema.optional(),
    brandId: idSchema.nullable().optional(),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
    latitude: coordinateSchema(-90, 90).nullable().optional(),
    longitude: coordinateSchema(-180, 180).nullable().optional(),
    businessHours: businessHoursSchema.optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    version: z.number().int().positive(),
  })
  .strict();
