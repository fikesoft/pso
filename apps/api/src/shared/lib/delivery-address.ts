import type { DeliveryAddressInput, DeliveryAddress } from '@pos/contracts';
import { domainHmac } from './sealed-json';
import { DELIVERY_ADDRESS_HASH_DOMAIN } from '../config/address.constants';
export function normalizeDeliveryAddress(
  input: DeliveryAddressInput | null | undefined,
): DeliveryAddress | null {
  return input
    ? { address: input.address.trim(), instructions: input.instructions?.trim() || null }
    : null;
}
export function deliveryAddressHash(
  organizationId: string,
  input: DeliveryAddressInput | null | undefined,
) {
  const address = normalizeDeliveryAddress(input);
  return address
    ? domainHmac(
        DELIVERY_ADDRESS_HASH_DOMAIN,
        JSON.stringify([organizationId, address.address, address.instructions]),
      )
    : null;
}
