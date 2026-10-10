import { decimalAtMost, PERMISSION_KEYS, supportsPermissionLimits } from '@pos/authz';
import { z } from 'zod';
export const decimalSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
    'Valoare zecimală pozitivă cu cel mult două zecimale.',
  );
export const limitsSchema = z
  .object({
    maxAmount: decimalSchema.optional(),
    maxPercent: decimalSchema
      .refine((value) => decimalAtMost(value, '100'), 'Procentul maxim este 100.')
      .optional(),
  })
  .strict();
export const permissionKeySchema = z.enum(
  PERMISSION_KEYS as [(typeof PERMISSION_KEYS)[number], ...(typeof PERMISSION_KEYS)[number][]],
);
export const permissionEntrySchema = z
  .object({ permission: permissionKeySchema, limits: limitsSchema.optional() })
  .strict()
  .refine(
    (value) => supportsPermissionLimits(value.permission, value.limits),
    'Permisiunea nu admite aceste limite.',
  );
export const permissionEntriesSchema = z
  .array(permissionEntrySchema)
  .min(1)
  .max(PERMISSION_KEYS.length)
  .refine(
    (entries) => new Set(entries.map((entry) => entry.permission)).size === entries.length,
    'Permisiunile nu se repetă.',
  );
