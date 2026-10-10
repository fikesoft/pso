import { customerMessages as text } from '@pos/ui/locales';
import type {
  CustomerDto,
  CustomerLookupRequest,
  CustomerLookupResponse,
  CustomerCreateRequest,
  CustomerCreateResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function lookupCustomer(api: Api, input: CustomerLookupRequest) {
  const customer = (await api.http.post<CustomerLookupResponse>('/customers/lookup', input)).data
    .customer;
  return customer === null ? null : confirmedCustomer(customer);
}
export async function createCustomer(api: Api, input: CustomerCreateRequest) {
  const response = await api.http.post<CustomerCreateResponse>('/customers', input, {
    headers: { 'Idempotency-Key': input.requestKey },
  });
  return confirmedCustomer(response.data.customer);
}

function confirmedCustomer(value: CustomerDto): CustomerDto {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !value.id ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    typeof value.phone !== 'string' ||
    !value.phone ||
    (value.name !== null && typeof value.name !== 'string')
  )
    throw new Error(text.invalidResponse);
  return value;
}
