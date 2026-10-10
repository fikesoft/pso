import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import { PACKING_ACTIONS, PACKING_BOARD_FILTERS } from './config/packing.constants';

const packingVersionSchema = z.number().int().min(1).max(2147483646);
const command = z.object({ version: packingVersionSchema, requestKey: idSchema });

export const packingCommandSchema = z.discriminatedUnion('action', [
  command.extend({ action: z.literal('START') }).strict(),
  command
    .extend({ action: z.literal('CHECK_ITEM'), itemId: idSchema, checked: z.boolean() })
    .strict(),
  command.extend({ action: z.literal('COMPLETE') }).strict(),
]);
export const resolvePackingCommandSchema = z
  .object({ sessionId: idSchema, requestKey: idSchema, action: z.enum(PACKING_ACTIONS) })
  .strict();
export const packingListQuerySchema = z
  .object({
    locationId: idSchema,
    status: z.enum(PACKING_BOARD_FILTERS).default('ACTIVE'),
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const result = z.object({
  sessionId: idSchema,
  requestKey: idSchema,
  expectedVersion: packingVersionSchema,
  version: z.number().int().min(2).max(2147483647),
  occurredAt: z.iso.datetime({ offset: true }),
});
export const packingCommandResultSchema = z
  .discriminatedUnion('action', [
    result.extend({ action: z.literal('START'), status: z.literal('PACKING') }).strict(),
    result
      .extend({
        action: z.literal('CHECK_ITEM'),
        status: z.literal('PACKING'),
        itemId: idSchema,
        checked: z.boolean(),
      })
      .strict(),
    result.extend({ action: z.literal('COMPLETE'), status: z.literal('READY') }).strict(),
  ])
  .refine((value) => value.version === value.expectedVersion + 1, {
    message: 'Versiunea rezultatului nu corespunde operației.',
  });
