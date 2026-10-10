import { idSchema } from '@pos/contracts';
import { sealJson, openJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { ADDRESS_CURSOR_DOMAIN } from '../config/address.constants';
import type { AddressCursorContext } from './address-cursor.types';
function associated(c: AddressCursorContext) {
  return [c.organizationId, c.userId, c.locationId, c.customerId];
}
export function addressCursor(context: AddressCursorContext, id: string) {
  return sealJson(ADDRESS_CURSOR_DOMAIN, associated(context), { id });
}
export function readAddressCursor(context: AddressCursorContext, cursor: string) {
  try {
    const value = openJson(ADDRESS_CURSOR_DOMAIN, associated(context), cursor) as { id?: unknown };
    return idSchema.parse(value.id);
  } catch {
    throw new HttpError(400, 'Cursorul adreselor nu este valid pentru acest context.');
  }
}
