import type { TenantTransaction } from '@pos/db';
import type { CustomerReference, OrderCustomerInput } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { orderContactPatch } from './order-customer-reference';
import { orderAddressPatch } from './order-address-reference';
import type { AddressOrderContext, AddressOrderInput } from './order-address.types';
export async function orderDraftContact(
  tx: TenantTransaction,
  access: AccessData,
  userId: string,
  current: AddressOrderContext,
  body: AddressOrderInput & {
    customer?: OrderCustomerInput | null;
    customerRef?: CustomerReference | null;
  },
) {
  const contact = await orderContactPatch(tx, access, userId, current, body);
  const customerId =
    contact.customerId === undefined ? (current.customerId ?? null) : contact.customerId;
  return {
    ...contact,
    ...(await orderAddressPatch(tx, access, userId, current, body, customerId)),
  };
}
