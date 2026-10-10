import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { customerAddressResponse } from '../../../entities/customer-address';
import { orderAddressColumns } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
import { requireLinkedCustomerAccess } from './order-customer-reference';
import type { AddressOrderContext, AddressOrderInput } from './order-address.types';
export async function orderAddressPatch(
  tx: TenantTransaction,
  access: AccessData,
  userId: string,
  current: AddressOrderContext,
  body: AddressOrderInput,
  customerId: string | null,
) {
  assert(
    body.serviceType === 'DELIVERY' ||
      !current.deliveryAddressEncrypted ||
      body.deliveryAddress === null,
    409,
    'Ștergeți explicit adresa înainte de a schimba tipul comenzii.',
  );
  assert(
    !current.customerAddressId ||
      customerId === current.customerId ||
      body.deliveryAddress !== undefined ||
      body.addressRef !== undefined,
    409,
    'Ștergeți, dezlegați sau reselectați adresa când schimbați clientul.',
  );
  if (body.addressRef) {
    assert(customerId, 409, 'Selectați clientul căruia îi aparține adresa.');
    requireLinkedCustomerAccess(access, userId, { locationId: current.locationId, customerId });
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    assert(customer?.status === 'ACTIVE', 409, 'Clientul este arhivat.');
    const address = await tx.customerAddress.findUnique({ where: { id: body.addressRef.id } });
    assert(address, 404, 'Adresa nu există');
    assert(address.customerId === customerId, 409, 'Adresa nu aparține clientului selectat.');
    assert(
      address.status === 'ACTIVE' && address.version === body.addressRef.version,
      409,
      'Adresa a fost modificată sau arhivată. Reîncărcați.',
    );
    return {
      ...orderAddressColumns(current, customerAddressResponse(address)),
      customerAddressId: address.id,
      customerAddressVersionSnapshot: address.version,
    };
  }
  if (body.deliveryAddress !== undefined)
    return {
      ...orderAddressColumns(current, body.deliveryAddress),
      customerAddressId: null,
      customerAddressVersionSnapshot: null,
    };
  return body.addressRef === null
    ? { customerAddressId: null, customerAddressVersionSnapshot: null }
    : {};
}
