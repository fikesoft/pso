import {
  customerLookupHash,
  normalizeCustomerName,
  normalizeCustomerPhone,
} from '../../../shared/lib/customer-identity';
export {
  customerLookupHash,
  normalizeCustomerName,
  normalizeCustomerPhone,
} from '../../../shared/lib/customer-identity';
import type { OrderCustomer, OrderCustomerInput } from '@pos/contracts';
import { orderCustomerSchema } from '@pos/contracts';
import { domainHmac, openJson, sealJson } from '../../../shared/lib/sealed-json';
import type { OrderCustomerColumns, OrderCustomerContext } from './order-customer.types';

export function normalizeOrderCustomer(
  input: OrderCustomerInput | null | undefined,
): OrderCustomer | null {
  const name = input?.name?.trim() || null;
  const phone = input?.phone?.trim() || null;
  return name || phone ? { name, phone } : null;
}
export function customerCreationHash(
  organizationId: string,
  input: OrderCustomerInput | null | undefined,
) {
  const customer = normalizeOrderCustomer(input);
  return customer
    ? domainHmac(
        'order-customer-creation-v1',
        JSON.stringify([
          organizationId,
          customer.name ? normalizeCustomerName(customer.name) : null,
          customer.phone ? normalizeCustomerPhone(customer.phone) : null,
        ]),
      )
    : null;
}
export function orderCustomerColumns(
  context: OrderCustomerContext,
  input: OrderCustomerInput | null | undefined,
): OrderCustomerColumns {
  const customer = normalizeOrderCustomer(input);
  return {
    customerDataEncrypted: customer
      ? sealJson(
          'order-customer-v1',
          [context.organizationId, context.locationId, context.id],
          customer,
        )
      : null,
    customerNameLookupHash: customer?.name
      ? customerLookupHash(context.organizationId, 'name', customer.name)
      : null,
    customerPhoneLookupHash: customer?.phone
      ? customerLookupHash(context.organizationId, 'phone', customer.phone)
      : null,
  };
}
export function readOrderCustomer(
  order: OrderCustomerContext & OrderCustomerColumns,
): OrderCustomer | null {
  if (!order.customerDataEncrypted) return null;
  return normalizeOrderCustomer(
    orderCustomerSchema.parse(
      openJson(
        'order-customer-v1',
        [order.organizationId, order.locationId, order.id],
        order.customerDataEncrypted,
      ),
    ),
  );
}
