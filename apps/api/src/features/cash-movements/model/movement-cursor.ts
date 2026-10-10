import { z } from 'zod';
import { idSchema } from '@pos/contracts';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { MOVEMENT_CURSOR_DOMAIN } from '../config/movement.constants';
import type { MovementCursorContext } from './movement.types';
function associated(c: MovementCursorContext) {
  return [c.organizationId, c.actor, c.locationId, c.shiftId, c.timezone, String(c.limit)];
}
export function movementCursor(c: MovementCursorContext, row: { id: string; createdAt: Date }) {
  return sealJson(MOVEMENT_CURSOR_DOMAIN, associated(c), {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
  });
}
export function readMovementCursor(c: MovementCursorContext, cursor: string) {
  try {
    return z
      .object({ id: idSchema, createdAt: z.string().datetime() })
      .strict()
      .parse(openJson(MOVEMENT_CURSOR_DOMAIN, associated(c), cursor));
  } catch {
    throw new HttpError(400, 'Cursorul mișcărilor nu este valid pentru acest context.');
  }
}
