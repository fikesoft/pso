import { z } from 'zod';
import { idSchema } from '@pos/contracts';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { SHIFT_CURSOR_DOMAIN } from '../config/shift.constants';
import type { ShiftCursorContext } from './shift-command.types';
function associated(c: ShiftCursorContext) {
  return [c.organizationId, c.actor, c.locationId, c.view, c.status, c.registerId ?? ''];
}
export function shiftCursor(context: ShiftCursorContext, row: { id: string; openedAt: Date }) {
  return sealJson(SHIFT_CURSOR_DOMAIN, associated(context), {
    id: row.id,
    openedAt: row.openedAt.toISOString(),
  });
}
export function readShiftCursor(context: ShiftCursorContext, cursor: string) {
  try {
    return z
      .object({ id: idSchema, openedAt: z.string().datetime() })
      .strict()
      .parse(openJson(SHIFT_CURSOR_DOMAIN, associated(context), cursor));
  } catch {
    throw new HttpError(400, 'Cursorul turelor nu este valid pentru acest context.');
  }
}
