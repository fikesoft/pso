import {
  customerManagementCommandSchema,
  customerManagementCommandResponseSchema,
  customerManagementDtoSchema,
  customerManagementListSchema,
  customerManagementListResponseSchema,
  customerManagementResolutionSchema,
  customerManagementSearchSchema,
} from '@pos/contracts/customer-management';
import type { CustomerManagementList, CustomerManagementSearch } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type { CustomerAttempt, CustomerPointer } from '../model/customer-management.types';

export async function readCustomers(api: Api, query: CustomerManagementList) {
  const response = await api.http.get('/customers', {
    params: customerManagementListSchema.parse(query),
  });
  return customerManagementListResponseSchema.parse(response.data);
}
export async function searchCustomers(api: Api, query: CustomerManagementSearch) {
  const response = await api.http.post(
    '/customers/search',
    customerManagementSearchSchema.parse(query),
  );
  return customerManagementListResponseSchema.parse(response.data);
}
export async function readManagedCustomer(api: Api, customerId: string, locationId: string) {
  const response = await api.http.get(`/customers/${encodeURIComponent(customerId)}`, {
    params: { locationId },
  });
  const customer = customerManagementDtoSchema.parse(response.data.customer);
  if (customer.id !== customerId) throw new Error(text.invalid);
  return customer;
}
export async function sendCustomerCommand(api: Api, attempt: CustomerAttempt) {
  const { customerId, ...input } = attempt;
  const body = customerManagementCommandSchema.parse(input);
  const response = await api.http.post(
    `/customers/${encodeURIComponent(customerId)}/commands`,
    body,
    {
      headers: { 'Idempotency-Key': body.requestKey },
    },
  );
  return customerManagementCommandResponseSchema.parse(response.data);
}
export async function resolveCustomerCommand(api: Api, pointer: CustomerPointer) {
  const body = customerManagementResolutionSchema.parse(pointer.command);
  const response = await api.http.post(
    `/customers/${encodeURIComponent(pointer.customerId)}/commands/resolution`,
    body,
    { headers: { 'Idempotency-Key': body.requestKey } },
  );
  return customerManagementCommandResponseSchema.parse(response.data);
}
