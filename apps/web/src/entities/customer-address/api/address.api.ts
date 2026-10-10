import type {
  CustomerAddressArchiveRequest,
  CustomerAddressCreateRequest,
  CustomerAddressCreationResolutionRequest,
  CustomerAddressCreationResolutionResponse,
  CustomerAddressListResponse,
  CustomerAddressResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readCustomerAddresses(
  api: Api,
  customerId: string,
  locationId: string,
  cursor?: string,
) {
  return (
    await api.http.get<CustomerAddressListResponse>(`/customers/${customerId}/addresses`, {
      params: { locationId, cursor },
    })
  ).data;
}
export async function createCustomerAddress(
  api: Api,
  customerId: string,
  input: CustomerAddressCreateRequest,
) {
  return (
    await api.http.post<CustomerAddressResponse>(`/customers/${customerId}/addresses`, input, {
      headers: { 'Idempotency-Key': input.requestKey },
    })
  ).data.address;
}
export async function archiveCustomerAddress(
  api: Api,
  customerId: string,
  addressId: string,
  input: CustomerAddressArchiveRequest,
) {
  return (
    await api.http.post<CustomerAddressResponse>(
      `/customers/${customerId}/addresses/${addressId}/archive`,
      input,
      { headers: { 'Idempotency-Key': input.requestKey } },
    )
  ).data.address;
}
export async function resolveCustomerAddress(
  api: Api,
  customerId: string,
  input: CustomerAddressCreationResolutionRequest,
) {
  return (
    await api.http.post<CustomerAddressCreationResolutionResponse>(
      `/customers/${customerId}/addresses/creation-resolution`,
      input,
      { headers: { 'Idempotency-Key': input.requestKey } },
    )
  ).data;
}
