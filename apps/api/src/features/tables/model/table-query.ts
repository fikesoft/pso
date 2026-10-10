import { z } from 'zod';
import { idSchema, diningTableCodeSchema } from '@pos/contracts';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { TABLE_CURSOR_DOMAIN } from '../config/table.constants';
import type { TableCursorContext } from './table-command.types';
function associated(c: TableCursorContext) {
  return [c.organizationId, c.actor, c.locationId, c.status];
}
export function tableCursor(
  context: TableCursorContext,
  row: { id: string; code: string; sortOrder: number },
) {
  return sealJson(TABLE_CURSOR_DOMAIN, associated(context), {
    id: row.id,
    code: row.code,
    sortOrder: row.sortOrder,
  });
}
export function readTableCursor(context: TableCursorContext, cursor: string) {
  try {
    return z
      .object({
        id: idSchema,
        code: diningTableCodeSchema,
        sortOrder: z.number().int().min(0).max(100000),
      })
      .strict()
      .parse(openJson(TABLE_CURSOR_DOMAIN, associated(context), cursor));
  } catch {
    throw new HttpError(400, 'Cursorul meselor nu este valid pentru acest context.');
  }
}
