import { z } from 'zod';
import { idSchema, versionSchema } from '../shared/validation';
import { KITCHEN_STATION_STATUSES } from './config/station.constants';
const pageShape = {
  locationId: idSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(2048).optional(),
};
const commandShape = { locationId: idSchema, requestKey: idSchema };
const mutationShape = { ...commandShape, version: versionSchema };
export const kitchenStationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{1,20}$/);
const edistationShape = {
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(100000),
};
export const kitchenStationListSchema = z
  .object({ ...pageShape, status: z.enum(KITCHEN_STATION_STATUSES).default('ACTIVE') })
  .strict();
export const kitchenStationCreateSchema = z
  .object({ ...commandShape, code: kitchenStationCodeSchema, ...edistationShape })
  .strict();
export const kitchenStationUpdateSchema = z
  .object({ ...mutationShape, ...edistationShape })
  .strict();
export const kitchenStationArchiveSchema = z.object(mutationShape).strict();
export const kitchenStationResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ ...commandShape, kind: z.literal('CREATE') }).strict(),
  z.object({ ...commandShape, kind: z.literal('UPDATE'), stationId: idSchema }).strict(),
  z.object({ ...commandShape, kind: z.literal('ARCHIVE'), stationId: idSchema }).strict(),
]);
