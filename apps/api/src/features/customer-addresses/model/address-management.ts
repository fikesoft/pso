import { addressManagementCommandResponseSchema, addressManagementDtoSchema } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { customerAddressResponse } from '../../../entities/customer-address';
import type { AddressCommandRow, ManagedAddress } from './address-management.types';
export function managedAddressResponse(address: ManagedAddress) {
  return addressManagementDtoSchema.parse({
    ...customerAddressResponse(address),
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  });
}
export async function addressCommandResponse(tx: TenantTransaction, command: AddressCommandRow) {
  const address = await tx.customerAddress.findUniqueOrThrow({ where: { id: command.addressId } });
  const preference = await tx.customerAddressPreference.findUniqueOrThrow({
    where: { customerId: command.customerId },
  });
  return addressManagementCommandResponseSchema.parse({
    status: command.status,
    command: {
      addressId: command.addressId,
      locationId: command.locationId,
      requestKey: command.requestKey,
      action: command.action,
    },
    result:
      command.status === 'SUCCEEDED'
        ? {
            customerId: command.customerId,
            addressId: command.addressId,
            requestKey: command.requestKey,
            action: command.action,
            expectedVersion: command.expectedVersion,
            version: command.resultVersion,
            status: command.resultStatus,
            expectedPreferenceVersion: command.expectedPreferenceVersion,
            preferenceVersion: command.resultPreferenceVersion,
            defaultAddressId: command.resultDefaultAddressId,
            occurredAt: command.createdAt.toISOString(),
          }
        : null,
    address: managedAddressResponse(address),
    preference: {
      customerId: preference.customerId,
      version: preference.version,
      defaultAddressId: preference.defaultAddressId,
    },
  });
}
