import {
  customerAnalyticsQuerySchema,
  customerAnalyticsResponseSchema,
} from '@pos/contracts/customer-analytics';
import type { CustomerAnalyticsQuery } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
export async function readCustomerAnalytics(
  api: Api,
  customerId: string,
  query: CustomerAnalyticsQuery,
) {
  const response = await api.http.get(`/customers/${encodeURIComponent(customerId)}/analytics`, {
    params: customerAnalyticsQuerySchema.parse(query),
  });
  const data = customerAnalyticsResponseSchema.parse(response.data);
  if (
    data.customerId !== customerId ||
    data.scope.scopeType !== query.scopeType ||
    (query.scopeType === 'LOCATION' &&
      (data.scope.scopeType !== 'LOCATION' ||
        data.scope.locationId !== query.locationId ||
        data.locations.length !== 1 ||
        data.locations[0]?.id !== query.locationId)) ||
    (data.metrics.favoriteLocation &&
      !data.locations.some((location) => location.id === data.metrics.favoriteLocation!.locationId))
  )
    throw new Error(text.invalid);
  return data;
}
