import { customerAddressCreateSchema } from '@pos/contracts';
import type {
  CustomerAddressCreateRequest,
  CustomerAddressArchiveRequest,
  CustomerAddressDto,
} from '@pos/contracts';
import {
  deliveryAddressHash,
  normalizeDeliveryAddress,
} from '../../../shared/lib/delivery-address';
import { sealJson, openJson, domainHmac } from '../../../shared/lib/sealed-json';
import {
  ADDRESS_PROFILE_DOMAIN,
  ADDRESS_CREATE_DOMAIN,
  ADDRESS_ARCHIVE_DOMAIN,
} from '../config/customer-address.constants';
import type { StoredCustomerAddress } from './customer-address.types';
export function addressCreationHash(
  organizationId: string,
  customerId: string,
  actorId: string,
  body: CustomerAddressCreateRequest,
) {
  return domainHmac(
    ADDRESS_CREATE_DOMAIN,
    JSON.stringify([
      organizationId,
      customerId,
      actorId,
      body.locationId,
      body.label?.trim() || null,
      normalizeDeliveryAddress(body),
    ]),
  );
}
export function addressArchiveHash(
  organizationId: string,
  customerId: string,
  id: string,
  actorId: string,
  body: CustomerAddressArchiveRequest,
) {
  return domainHmac(
    ADDRESS_ARCHIVE_DOMAIN,
    JSON.stringify([organizationId, customerId, id, actorId, body.locationId, body.version]),
  );
}
export function addressProfileColumns(
  organizationId: string,
  customerId: string,
  id: string,
  body: Pick<CustomerAddressCreateRequest, 'label' | 'address' | 'instructions'>,
) {
  return {
    privateDataEncrypted: sealJson(ADDRESS_PROFILE_DOMAIN, [organizationId, customerId, id], {
      label: body.label?.trim() || null,
      ...normalizeDeliveryAddress(body),
    }),
    snapshotHash: deliveryAddressHash(organizationId, body)!,
  };
}
export function customerAddressResponse(row: StoredCustomerAddress): CustomerAddressDto {
  const data = customerAddressCreateSchema
    .pick({ label: true, address: true, instructions: true })
    .parse(
      openJson(
        ADDRESS_PROFILE_DOMAIN,
        [row.organizationId, row.customerId, row.id],
        row.privateDataEncrypted,
      ),
    );
  return {
    id: row.id,
    customerId: row.customerId,
    version: row.version,
    status: row.status as CustomerAddressDto['status'],
    label: data.label ?? null,
    address: data.address,
    instructions: data.instructions ?? null,
  };
}
