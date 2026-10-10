import { z } from 'zod';
import { idSchema, cashRegisterCodeSchema } from '@pos/contracts';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { REGISTER_CURSOR_DOMAIN } from '../config/register.constants';
import type { RegisterCursorContext } from './register-command.types';
function associated(c: RegisterCursorContext) {
  return [c.organizationId, c.actor, c.locationId, c.status];
}
export function registerCursor(context: RegisterCursorContext, row: { id: string; code: string }) {
  return sealJson(REGISTER_CURSOR_DOMAIN, associated(context), { id: row.id, code: row.code });
}
export function readRegisterCursor(context: RegisterCursorContext, cursor: string) {
  try {
    return z
      .object({ id: idSchema, code: cashRegisterCodeSchema })
      .strict()
      .parse(openJson(REGISTER_CURSOR_DOMAIN, associated(context), cursor));
  } catch {
    throw new HttpError(400, 'Cursorul caselor nu este valid pentru acest context.');
  }
}
