import { getPermission, PERMISSION_KEYS, supportsPermissionLimits } from '@pos/authz';
import { z } from 'zod';
import {
  idSchema,
  limitsSchema,
  permissionEntriesSchema,
  permissionEntrySchema,
  permissionKeySchema,
  SCOPE_MESSAGE,
  scopeShape,
  validScope,
} from '../shared';
export const createOverrideSchema = z
  .object({
    permission: permissionKeySchema,
    effect: z.enum(['ALLOW', 'DENY']),
    ...scopeShape,
    limits: limitsSchema.optional(),
  })
  .strict()
  .refine(validScope, SCOPE_MESSAGE)
  .refine(
    (value) => !('permission' in value) || supportsPermissionLimits(value.permission, value.limits),
    'Permisiunea nu admite aceste limite.',
  )
  .refine(
    (value) =>
      value.effect === 'DENY' ||
      getPermission(value.permission)?.scopeTypes.includes(value.scopeType),
    'Permisiunea nu admite acest scope.',
  )
  .refine(
    (value) => value.effect !== 'DENY' || value.limits === undefined,
    'DENY interzice integral acțiunea; nu admite limite.',
  );
export const createDelegationSchema = z
  .object({
    userId: idSchema,
    ...scopeShape,
    permissions: permissionEntriesSchema,
  })
  .strict()
  .refine(validScope, SCOPE_MESSAGE)
  .refine(
    (value) =>
      value.permissions.every((entry) => {
        const definition = getPermission(entry.permission);
        return definition?.delegable && definition.scopeTypes.includes(value.scopeType);
      }),
    'Plafonul conține o permisiune nedelegabilă sau un scope nevalid.',
  );
export const revokeDelegationSchema = z
  .object({ reason: z.string().trim().min(5).max(500) })
  .strict();
export const accessPreviewSchema = z
  .object({
    userId: idSchema.optional(),
    ...scopeShape,
    permissions: z.array(permissionEntrySchema).max(PERMISSION_KEYS.length).optional(),
    effect: z.enum(['ALLOW', 'DENY']).optional(),
  })
  .strict()
  .refine(validScope, SCOPE_MESSAGE);
