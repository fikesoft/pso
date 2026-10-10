import { z } from 'zod';
import { idSchema } from '@pos/contracts';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import {
  RESPONSIBILITY_CURSOR_DOMAIN,
  RESPONSIBILITY_HISTORY_CURSOR_DOMAIN,
} from '../config/responsibility.constants';
import type {
  ResponsibilityCursorContext,
  ResponsibilityHistoryContext,
} from './responsibility.types';
function associated(c: ResponsibilityCursorContext) {
  const q = c.query;
  return [
    c.organizationId,
    c.actor,
    q.locationId,
    q.view,
    'perspective' in q ? q.perspective : '',
    'shiftId' in q ? q.shiftId : '',
    String(q.limit),
    c.timezone,
  ];
}
export function responsibilityCursor(c: ResponsibilityCursorContext, number: number) {
  return sealJson(RESPONSIBILITY_CURSOR_DOMAIN, associated(c), { number });
}
export function readResponsibilityCursor(c: ResponsibilityCursorContext, cursor: string) {
  try {
    return z
      .object({ number: z.number().int().positive() })
      .strict()
      .parse(openJson(RESPONSIBILITY_CURSOR_DOMAIN, associated(c), cursor)).number;
  } catch {
    throw new HttpError(400, 'Cursorul nu este valid pentru această listă.');
  }
}
function historyAssociated(c: ResponsibilityHistoryContext) {
  return [c.organizationId, c.actor, c.locationId, c.orderId, String(c.limit), c.timezone];
}
export function responsibilityHistoryCursor(
  c: ResponsibilityHistoryContext,
  event: { id: string; createdAt: Date },
) {
  return sealJson(RESPONSIBILITY_HISTORY_CURSOR_DOMAIN, historyAssociated(c), {
    id: event.id,
    createdAt: event.createdAt.toISOString(),
  });
}
export function readResponsibilityHistoryCursor(c: ResponsibilityHistoryContext, cursor: string) {
  try {
    return z
      .object({ id: idSchema, createdAt: z.string().datetime() })
      .strict()
      .parse(openJson(RESPONSIBILITY_HISTORY_CURSOR_DOMAIN, historyAssociated(c), cursor));
  } catch {
    throw new HttpError(400, 'Cursorul nu este valid pentru acest istoric.');
  }
}
