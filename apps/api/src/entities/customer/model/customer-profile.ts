import { createCustomerSchema } from '@pos/contracts';
import type { CustomerCreateRequest, CustomerDto } from '@pos/contracts';
import {
  customerLookupHash,
  normalizeCustomerName,
  normalizeCustomerPhone,
} from '../../../shared/lib/customer-identity';
import { domainHmac, openJson, sealJson } from '../../../shared/lib/sealed-json';
import { CUSTOMER_CREATION_DOMAIN, CUSTOMER_PROFILE_DOMAIN } from '../config/customer.constants';
import type { StoredCustomer } from './customer.types';

export function customerRegistrationHash(
  organizationId: string,
  actorUserId: string,
  body: CustomerCreateRequest,
) {
  return domainHmac(
    CUSTOMER_CREATION_DOMAIN,
    JSON.stringify([
      organizationId,
      actorUserId,
      body.locationId,
      body.name ? normalizeCustomerName(body.name) || null : null,
      normalizeCustomerPhone(body.phone),
      ...(body.email ? [body.email.trim()] : []),
    ]),
  );
}
export function customerProfileColumns(
  organizationId: string,
  id: string,
  body: Pick<CustomerCreateRequest, 'name' | 'phone' | 'email'>,
) {
  const profile = {
    name: body.name?.trim() || null,
    phone: body.phone.trim(),
    ...(body.email ? { email: body.email.trim() } : {}),
  };
  return {
    privateDataEncrypted: sealJson(CUSTOMER_PROFILE_DOMAIN, [organizationId, id], profile),
    phoneLookupHash: customerLookupHash(organizationId, 'phone', profile.phone)!,
    nameLookupHash: profile.name ? customerLookupHash(organizationId, 'name', profile.name) : null,
  };
}
export function customerProfile(customer: StoredCustomer) {
  const profile = createCustomerSchema
    .pick({ name: true, phone: true, email: true })
    .parse(
      openJson(
        CUSTOMER_PROFILE_DOMAIN,
        [customer.organizationId, customer.id],
        customer.privateDataEncrypted,
      ),
    );
  return { name: profile.name?.trim() || null, phone: profile.phone, email: profile.email ?? null };
}
export function customerResponse(customer: StoredCustomer): CustomerDto {
  const profile = customerProfile(customer);
  return { id: customer.id, version: customer.version, name: profile.name, phone: profile.phone };
}
