import { z } from 'zod';
import { idSchema, versionSchema } from '../shared/validation';
import { CASH_REGISTER_FILTERS } from './config/cash-register.constants';
const registerNameSchema = z.string().trim().min(1).max(120);
export const cashRegisterCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{1,32}$/);
export const cashRegisterQuerySchema = z
  .object({
    locationId: idSchema,
    status: z.enum(CASH_REGISTER_FILTERS).default('ACTIVE'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const cashRegisterDetailSchema = z.object({ locationId: idSchema }).strict();
export const cashRegisterCreateSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    code: cashRegisterCodeSchema,
    name: registerNameSchema,
  })
  .strict();
export const cashRegisterRenameSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    version: versionSchema,
    name: registerNameSchema,
  })
  .strict();
export const cashRegisterArchiveSchema = cashRegisterRenameSchema.omit({ name: true });
export const cashRegisterResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ locationId: idSchema, requestKey: idSchema, kind: z.literal('CREATE') }).strict(),
  z
    .object({
      locationId: idSchema,
      requestKey: idSchema,
      kind: z.literal('RENAME'),
      registerId: idSchema,
    })
    .strict(),
  z
    .object({
      locationId: idSchema,
      requestKey: idSchema,
      kind: z.literal('ARCHIVE'),
      registerId: idSchema,
    })
    .strict(),
]);
