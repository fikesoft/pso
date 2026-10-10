import type { CustomerAnalyticsResponse, CustomerRfm } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface CustomerAnalyticsProps {
  api: Api;
  customerId: string;
  locationId: string;
}
export interface CustomerAnalyticsMetricsProps {
  report: CustomerAnalyticsResponse;
}

export interface CustomerRfmProps {
  rfm: CustomerRfm;
}
