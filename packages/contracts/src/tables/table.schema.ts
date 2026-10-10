import { z } from 'zod';
import { idSchema, versionSchema } from '../shared/validation';
import { DINING_TABLE_STATUSES } from './config/table.constants';
const pageShape = {
  locationId: idSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(2048).optional(),
};
const commandShape = { locationId: idSchema, requestKey: idSchema };
const mutationShape = { ...commandShape, version: versionSchema };
const guestCountSchema = z.number().int().min(1).max(999);
const reasonSchema = z.string().trim().min(3).max(500);
export const diningTableCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{1,20}$/);
const editableShape = {
  name: z.string().trim().min(1).max(80),
  capacity: guestCountSchema,
  sortOrder: z.number().int().min(0).max(100000),
};
export const diningTableListSchema = z
  .object({ ...pageShape, status: z.enum(DINING_TABLE_STATUSES).default('ACTIVE') })
  .strict();
export const diningTableCreateSchema = z
  .object({ ...commandShape, code: diningTableCodeSchema, ...editableShape })
  .strict();
export const diningTableUpdateSchema = z.object({ ...mutationShape, ...editableShape }).strict();
export const diningTableArchiveSchema = z.object(mutationShape).strict();
export const diningTableResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ ...commandShape, kind: z.literal('CREATE') }).strict(),
  z.object({ ...commandShape, kind: z.literal('UPDATE'), tableId: idSchema }).strict(),
  z.object({ ...commandShape, kind: z.literal('ARCHIVE'), tableId: idSchema }).strict(),
]);
export const tableMapQuerySchema = z.object(pageShape).strict();
export const tableVisitOpenSchema = z
  .object({ ...commandShape, guestCount: guestCountSchema })
  .strict();
export const tableVisitDetailSchema = z.object({ locationId: idSchema }).strict();
export const tableVisitOrderQuerySchema = z
  .object({ ...pageShape, statusGroup: z.enum(['ACTIVE', 'ALL']).default('ACTIVE') })
  .strict();
export const tableVisitHistorySchema = z.object(pageShape).strict();
export const tableWaiterListSchema = z.object(pageShape).strict();
export const tableVisitCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...mutationShape,
      kind: z.literal('GUEST_COUNT_CHANGED'),
      guestCount: guestCountSchema,
    })
    .strict(),
  z.object({ ...mutationShape, kind: z.literal('BILL_REQUESTED') }).strict(),
  z.object({ ...mutationShape, kind: z.literal('BILL_CANCELLED') }).strict(),
  z
    .object({
      ...mutationShape,
      kind: z.literal('WAITER_CHANGED'),
      targetWaiterUserId: idSchema,
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      ...mutationShape,
      kind: z.literal('MOVED'),
      targetTableId: idSchema,
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      ...mutationShape,
      kind: z.literal('MERGED'),
      targetVisitId: idSchema,
      targetVersion: versionSchema,
      reason: reasonSchema,
    })
    .strict(),
  z.object({ ...mutationShape, kind: z.literal('CLOSE'), reason: reasonSchema }).strict(),
]);
export const tableVisitResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ ...commandShape, kind: z.literal('OPEN'), tableId: idSchema }).strict(),
  z.object({ ...commandShape, kind: z.literal('GUEST_COUNT_CHANGED'), visitId: idSchema }).strict(),
  z.object({ ...commandShape, kind: z.literal('BILL_REQUESTED'), visitId: idSchema }).strict(),
  z.object({ ...commandShape, kind: z.literal('BILL_CANCELLED'), visitId: idSchema }).strict(),
  z
    .object({
      ...commandShape,
      kind: z.literal('WAITER_CHANGED'),
      visitId: idSchema,
      targetWaiterUserId: idSchema,
    })
    .strict(),
  z
    .object({
      ...commandShape,
      kind: z.literal('MOVED'),
      visitId: idSchema,
      targetTableId: idSchema,
    })
    .strict(),
  z
    .object({
      ...commandShape,
      kind: z.literal('MERGED'),
      visitId: idSchema,
      targetVisitId: idSchema,
    })
    .strict(),
  z.object({ ...commandShape, kind: z.literal('CLOSE'), visitId: idSchema }).strict(),
]);
