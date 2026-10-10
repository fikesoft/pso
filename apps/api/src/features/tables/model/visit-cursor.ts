import { z } from 'zod';
import { idSchema } from '@pos/contracts';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { VISIT_CURSOR_DOMAIN } from '../config/visit.constants';
const positionSchema = z.union([idSchema, z.number().int().nonnegative()]);
export function visitCursor(context: string[], position: string | number) {
  return sealJson(VISIT_CURSOR_DOMAIN, context, { position });
}
export function readVisitCursor(context: string[], cursor?: string) {
  if (!cursor) return undefined;
  try {
    return z
      .object({ position: positionSchema })
      .strict()
      .parse(openJson(VISIT_CURSOR_DOMAIN, context, cursor)).position;
  } catch {
    throw new HttpError(400, 'Cursorul nu este valid pentru această vizită.');
  }
}
