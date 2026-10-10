import { z } from 'zod';
import { idSchema } from '@pos/contracts';
import { sealJson, openJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import {
  DISCREPANCY_CURSOR_DOMAIN,
  DISCREPANCY_REGISTERS_CURSOR_DOMAIN,
} from '../config/discrepancy.constants';
import type { DiscrepancyContext } from './discrepancy.types';
function associated(c: DiscrepancyContext) {
  return [
    c.organizationId,
    c.actor,
    c.locationId,
    c.closedFrom,
    c.closedTo,
    c.discrepancy,
    c.registerId ?? '',
    c.timezone,
    String(c.limit),
  ];
}
export function closingCursor(c: DiscrepancyContext, row: { id: string; closedAt: Date }) {
  return sealJson(DISCREPANCY_CURSOR_DOMAIN, associated(c), {
    id: row.id,
    closedAt: row.closedAt.toISOString(),
  });
}
export function readClosingCursor(c: DiscrepancyContext, cursor: string) {
  try {
    return z
      .object({ id: idSchema, closedAt: z.string().datetime() })
      .strict()
      .parse(openJson(DISCREPANCY_CURSOR_DOMAIN, associated(c), cursor));
  } catch {
    throw new HttpError(400, 'Cursorul raportului nu este valid pentru acest context.');
  }
}
export function registerCursor(c: DiscrepancyContext, registerId: string) {
  return sealJson(DISCREPANCY_REGISTERS_CURSOR_DOMAIN, associated(c), { registerId });
}
export function readRegisterCursor(c: DiscrepancyContext, cursor: string) {
  try {
    return z
      .object({ registerId: idSchema })
      .strict()
      .parse(openJson(DISCREPANCY_REGISTERS_CURSOR_DOMAIN, associated(c), cursor));
  } catch {
    throw new HttpError(400, 'Cursorul caselor raportate nu este valid pentru acest context.');
  }
}
