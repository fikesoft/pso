import {
  addressManagementCommandSchema,
  addressManagementCommandResponseSchema,
  addressManagementDtoSchema,
  addressManagementListResponseSchema,
  addressManagementProfileSchema,
  addressManagementQuerySchema,
} from '@pos/contracts/address-management';
import type { AddressManagementQuery } from '@pos/contracts';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type { Api } from '../../../shared/api';
import { createCustomerAddress, resolveCustomerAddress } from './address.api';
import { sameAddressBookIdentity } from '../lib/address-book-pointer';
import type { AddressBookAttempt, AddressBookPointer } from '../model/address-management.types';
export async function readAddressBook(api: Api, customerId: string, query: AddressManagementQuery) {
  const response = await api.http.get(`/customers/${customerId}/address-book`, {
    params: addressManagementQuerySchema.parse(query),
  });
  const data = addressManagementListResponseSchema.parse(response.data);
  if (data.preference.customerId !== customerId) throw new Error(text.invalid);
  return data;
}
function createdAddress(pointer: AddressBookPointer, value: unknown) {
  const address = addressManagementDtoSchema
    .omit({ createdAt: true, updatedAt: true })
    .parse(value);
  if (address.customerId !== pointer.customerId) throw new Error(text.invalid);
}
function outcome(pointer: AddressBookPointer, value: unknown, attempt?: AddressBookAttempt) {
  const response = addressManagementCommandResponseSchema.parse(value);
  if (
    !sameAddressBookIdentity(response.command, pointer.command) ||
    response.address.customerId !== pointer.customerId
  )
    throw new Error(text.invalid);
  if (
    response.status === 'SUCCEEDED' &&
    attempt &&
    attempt.action !== 'CREATE' &&
    (response.result.expectedVersion !== attempt.version ||
      ('preferenceVersion' in attempt &&
        response.result.expectedPreferenceVersion !== attempt.preferenceVersion))
  )
    throw new Error(text.invalid);
  return response.status;
}
export async function sendAddressBook(
  api: Api,
  pointer: AddressBookPointer,
  attempt: AddressBookAttempt,
) {
  if (attempt.action === 'CREATE') {
    const address = await createCustomerAddress(api, pointer.customerId, {
      ...addressManagementProfileSchema.parse(attempt.profile),
      locationId: attempt.locationId,
      requestKey: attempt.requestKey,
    });
    createdAddress(pointer, address);
    return 'SUCCEEDED' as const;
  }
  const { addressId, ...body } = attempt;
  const response = await api.http.post(
    `/customers/${pointer.customerId}/addresses/${addressId}/commands`,
    addressManagementCommandSchema.parse(body),
    {
      headers: { 'Idempotency-Key': attempt.requestKey },
    },
  );
  return outcome(pointer, response.data, attempt);
}
export async function resolveAddressBook(api: Api, pointer: AddressBookPointer) {
  const command = pointer.command;
  if (command.action === 'CREATE') {
    const response = await resolveCustomerAddress(api, pointer.customerId, {
      locationId: command.locationId,
      requestKey: command.requestKey,
    });
    if (response.status === 'CREATED') {
      createdAddress(pointer, response.address);
      return 'SUCCEEDED' as const;
    }
    if (
      response.status !== 'RETIRED' ||
      response.customerId !== pointer.customerId ||
      response.locationId !== command.locationId ||
      response.requestKey !== command.requestKey
    )
      throw new Error(text.invalid);
    return 'RETIRED' as const;
  }
  const { addressId, ...body } = command;
  const response = await api.http.post(
    `/customers/${pointer.customerId}/addresses/${addressId}/commands/resolution`,
    body,
    { headers: { 'Idempotency-Key': command.requestKey } },
  );
  return outcome(pointer, response.data);
}
