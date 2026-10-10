import { z } from 'zod';
import { permissionEntriesSchema } from '../shared';
export const roleVersionSchema = z.object({ permissions: permissionEntriesSchema }).strict();
export const createRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
    permissions: permissionEntriesSchema,
  })
  .strict();
