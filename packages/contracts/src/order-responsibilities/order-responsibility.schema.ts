import { z } from 'zod';
import { idSchema, versionSchema } from '../shared/validation';
const page = {
  locationId: idSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(2048).optional(),
};
const reason = z.string().trim().min(3).max(500);
const identity = { locationId: idSchema, requestKey: idSchema };
const command = {
  ...identity,
  orderVersion: versionSchema,
  responsibilityVersion: z.number().int().min(0).max(2_147_483_646),
  reason,
};
export const orderResponsibilityListSchema = z.discriminatedUnion('view', [
  z.object({ ...page, view: z.literal('UNASSIGNED') }).strict(),
  z.object({ ...page, view: z.literal('ASSIGNED'), shiftId: idSchema }).strict(),
  z
    .object({
      ...page,
      view: z.literal('PENDING'),
      shiftId: idSchema,
      perspective: z.enum(['INCOMING', 'OUTGOING']),
    })
    .strict(),
]);
export const orderResponsibilityDetailSchema = z.object({ locationId: idSchema }).strict();
export const orderResponsibilityHistorySchema = z.object(page).strict();
export const orderResponsibilityCommandSchema = z.discriminatedUnion('kind', [
  z.object({ ...command, kind: z.literal('ASSIGN'), targetShiftId: idSchema }).strict(),
  z
    .object({
      ...command,
      kind: z.literal('PREPARE_HANDOFF'),
      sourceShiftId: idSchema,
      managerReason: reason.optional(),
    })
    .strict(),
  z
    .object({
      ...command,
      kind: z.literal('ACCEPT_HANDOFF'),
      handoffEventId: idSchema,
      targetShiftId: idSchema,
    })
    .strict(),
]);
export const orderResponsibilityResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ ...identity, kind: z.literal('ASSIGN'), targetShiftId: idSchema }).strict(),
  z.object({ ...identity, kind: z.literal('PREPARE_HANDOFF'), sourceShiftId: idSchema }).strict(),
  z
    .object({
      ...identity,
      kind: z.literal('ACCEPT_HANDOFF'),
      handoffEventId: idSchema,
      targetShiftId: idSchema,
    })
    .strict(),
]);
