import { z } from 'zod';
import { idSchema, kitchenStationCodeSchema } from '@pos/contracts';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { STATION_CURSOR_DOMAIN } from '../config/station.constants';
import type { StationCursorContext } from './station-command.types';
function associated(c: StationCursorContext) {
  return [c.organizationId, c.actor, c.locationId, c.status];
}
export function stationCursor(
  context: StationCursorContext,
  row: { id: string; code: string; sortOrder: number },
) {
  return sealJson(STATION_CURSOR_DOMAIN, associated(context), {
    id: row.id,
    code: row.code,
    sortOrder: row.sortOrder,
  });
}
export function readStationCursor(context: StationCursorContext, cursor: string) {
  try {
    return z
      .object({
        id: idSchema,
        code: kitchenStationCodeSchema,
        sortOrder: z.number().int().min(0).max(100000),
      })
      .strict()
      .parse(openJson(STATION_CURSOR_DOMAIN, associated(context), cursor));
  } catch {
    throw new HttpError(400, 'Cursorul stațiilor nu este valid pentru acest context.');
  }
}
