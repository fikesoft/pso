import { customerHistoryQuerySchema } from '@pos/contracts/customer-history';
import type { CustomerHistoryQuery, CustomerHistoryResponse } from '@pos/contracts';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type { Api } from '../../../shared/api';

export async function readCustomerHistory(
  api: Api,
  customerId: string,
  query: CustomerHistoryQuery,
) {
  const { data } = await api.http.get<CustomerHistoryResponse>(
    `/customers/${encodeURIComponent(customerId)}/orders`,
    { params: customerHistoryQuerySchema.parse(query) },
  );
  if (
    data.customerId !== customerId ||
    data.locationId !== query.locationId ||
    !Array.isArray(data.orders) ||
    data.orders.some(
      (order) =>
        order.locationId !== query.locationId ||
        order.customerRef?.id !== customerId ||
        (query.status && order.status !== query.status),
    )
  )
    throw new Error(text.invalid);
  return data;
}
