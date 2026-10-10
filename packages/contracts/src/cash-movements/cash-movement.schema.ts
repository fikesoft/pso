import { z } from 'zod';
import { idSchema, positiveMoneySchema, versionSchema } from '../shared/validation';
import { CASH_DRAWER_KINDS, CASH_MOVEMENT_DIRECTIONS } from './config/cash-movement.constants';
export const cashMovementCreateSchema = z
  .object({
    locationId: idSchema,
    version: versionSchema,
    requestKey: idSchema,
    direction: z.enum(CASH_MOVEMENT_DIRECTIONS),
    amount: positiveMoneySchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const cashMovementResolutionSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    kind: z.enum(CASH_DRAWER_KINDS),
    shiftId: idSchema,
  })
  .strict();
export const cashMovementListSchema = z
  .object({
    locationId: idSchema,
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
