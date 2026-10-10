import { z } from 'zod';
import { openJson, sealJson, domainHmac } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { ORDER_CURSOR_DOMAIN } from '../config/order-search.constants';
import type { OrderCursorContext } from './order-search.types';

const anchorSchema = z.object({ number: z.number().int().positive() }).strict();
function associated(context: OrderCursorContext) {
  return [
    context.organizationId,
    context.locationId,
    context.userId,
    context.kind,
    context.fingerprint,
  ];
}
export function orderFilterFingerprint(value: unknown) {
  return domainHmac('order-search-filter-v1', JSON.stringify(value));
}
export function encodeOrderCursor(context: OrderCursorContext, number: number) {
  return sealJson(ORDER_CURSOR_DOMAIN, associated(context), { number });
}
export function decodeOrderCursor(context: OrderCursorContext, cursor: string) {
  try {
    return anchorSchema.parse(openJson(ORDER_CURSOR_DOMAIN, associated(context), cursor)).number;
  } catch {
    throw new HttpError(400, 'Cursorul de paginare nu este valid pentru această căutare.');
  }
}
