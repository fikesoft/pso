import { z } from 'zod';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { ACTIVE_CURSOR_DOMAIN, ACTIVE_POLICY_VERSION } from '../config/order-active.constants';
import type { ActiveOrderContext } from './order-active.types';

const anchorSchema = z.object({ number: z.number().int().positive().max(2_147_483_647) }).strict();
function associated(context: ActiveOrderContext) {
  return [context.organizationId, context.locationId, context.userId, ACTIVE_POLICY_VERSION];
}
export function encodeActiveOrderCursor(context: ActiveOrderContext, number: number) {
  return sealJson(ACTIVE_CURSOR_DOMAIN, associated(context), { number });
}
export function decodeActiveOrderCursor(context: ActiveOrderContext, cursor: string) {
  try {
    return anchorSchema.parse(openJson(ACTIVE_CURSOR_DOMAIN, associated(context), cursor)).number;
  } catch {
    throw new HttpError(400, 'Cursorul nu este valid pentru comenzile active.');
  }
}
