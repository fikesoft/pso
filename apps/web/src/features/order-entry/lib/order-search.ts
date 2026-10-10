import { MAX_ORDER_SEARCH_NUMBER } from '../config/order-search.constants';
import type { OrderSearchRequest } from '@pos/contracts';
import { orderSearchMessages as text } from '@pos/ui/locales';
import type { OrderSearchFields } from '../model/order-search.types';
export function orderSearchInput(
  fields: OrderSearchFields,
  locationId: string,
): OrderSearchRequest {
  const number = fields.number.trim();
  if (
    number &&
    (!/^\d+$/.test(number) ||
      !Number.isSafeInteger(Number(number)) ||
      Number(number) <= 0 ||
      Number(number) > MAX_ORDER_SEARCH_NUMBER)
  )
    throw new Error(text.invalidNumber);
  if (fields.createdFrom && fields.createdTo && fields.createdFrom > fields.createdTo)
    throw new Error(text.invalidDates);
  return {
    locationId,
    ...(number ? { number: Number(number) } : {}),
    ...(fields.customerName.trim() ? { customerName: fields.customerName.trim() } : {}),
    ...(fields.customerPhone.trim() ? { customerPhone: fields.customerPhone.trim() } : {}),
    ...(fields.createdByUserId ? { createdByUserId: fields.createdByUserId } : {}),
    ...(fields.status ? { status: fields.status as OrderSearchRequest['status'] } : {}),
    ...(fields.source ? { source: fields.source as OrderSearchRequest['source'] } : {}),
    ...(fields.createdFrom ? { createdFrom: fields.createdFrom } : {}),
    ...(fields.createdTo ? { createdTo: fields.createdTo } : {}),
  };
}
