import { z } from 'zod';
import { idSchema, versionSchema } from '../shared';

const queryVersionSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(versionSchema);

export const mediaUploadQuerySchema = z
  .object({ version: queryVersionSchema, requestKey: idSchema })
  .strict();
export const mediaClearSchema = z.object({ version: versionSchema, requestKey: idSchema }).strict();
export const avatarReadQuerySchema = z.object({ assetId: idSchema }).strict();
export const productImageReadQuerySchema = avatarReadQuerySchema
  .extend({ locationId: idSchema })
  .strict();
