import { z } from 'zod';
import { SCOPE_MESSAGE } from '../config/scope.constants';
import { idSchema } from './identity.schema';
import type { ScopeInput } from './scope.types';
export const scopeShape = {
  scopeType: z.enum(['ORGANIZATION', 'LOCATION']),
  locationId: idSchema.nullable().optional(),
};

export function validScope(value: ScopeInput): boolean {
  return value.scopeType === 'LOCATION' ? !!value.locationId : !value.locationId;
}

export const scopeSchema = z.object(scopeShape).strict().refine(validScope, SCOPE_MESSAGE);
export const assignmentSchema = z
  .object({ roleVersionId: idSchema, ...scopeShape })
  .strict()
  .refine(validScope, SCOPE_MESSAGE);
