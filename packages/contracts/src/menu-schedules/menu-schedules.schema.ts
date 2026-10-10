import { z } from 'zod';
import { businessDateSchema, idSchema } from '../shared';
import {
  MAX_SCHEDULE_PRODUCTS,
  MENU_AVAILABILITY_BATCH_SIZE,
} from './config/menu-schedules.constants';

const scheduleFields = {
  name: z.string().trim().min(2).max(100),
  eventName: z.string().trim().min(2).max(100).nullable(),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'Zilele nu se repetă.'),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1440),
  startsOn: businessDateSchema.nullable(),
  endsOn: businessDateSchema.nullable(),
  productIds: z
    .array(idSchema)
    .min(1)
    .max(MAX_SCHEDULE_PRODUCTS)
    .refine((ids) => new Set(ids).size === ids.length, 'Produsele nu se repetă.'),
};

const scheduleShape = z
  .object(scheduleFields)
  .strict()
  .superRefine((schedule, ctx) => {
    if (schedule.startMinute === schedule.endMinute)
      ctx.addIssue({
        code: 'custom',
        path: ['endMinute'],
        message: 'Intervalul trebuie să aibă durată. Pentru întreaga zi folosiți 00:00–24:00.',
      });
    if (schedule.startsOn && schedule.endsOn && schedule.startsOn > schedule.endsOn)
      ctx.addIssue({
        code: 'custom',
        path: ['endsOn'],
        message: 'Sfârșitul perioadei nu poate fi anterior începutului.',
      });
    if (schedule.eventName && (!schedule.startsOn || !schedule.endsOn))
      ctx.addIssue({
        code: 'custom',
        path: ['eventName'],
        message: 'Evenimentul cere o perioadă cu început și sfârșit.',
      });
  });

export const createMenuScheduleSchema = scheduleShape.safeExtend({
  locationId: idSchema,
  requestKey: idSchema,
});
export const updateMenuScheduleSchema = scheduleShape.safeExtend({
  version: z.number().int().positive(),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
});
export const menuSchedulesQuerySchema = z
  .object({
    locationId: idSchema,
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    includeArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

export const menuAvailabilityQuerySchema = z
  .object({
    locationId: idSchema,
    productIds: z
      .string()
      .max(MENU_AVAILABILITY_BATCH_SIZE * 37)
      .transform((value) => value.split(','))
      .pipe(z.array(idSchema).min(1).max(MENU_AVAILABILITY_BATCH_SIZE)),
  })
  .strict();
