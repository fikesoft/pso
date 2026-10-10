import { z } from 'zod';

export const customerNameSchema = z.string().trim().max(160);
export const customerPhoneSchema = z
  .string()
  .trim()
  .max(80)
  .refine(
    (value) => !value || (/^\+?[0-9\s().-]+$/u.test(value) && /[0-9]/.test(value)),
    'Numărul de telefon nu este valid.',
  );

import { idSchema } from './identity.schema';
import { versionSchema } from './operations.schema';
export const customerRefSchema = z.object({ id: idSchema, version: versionSchema }).strict();
