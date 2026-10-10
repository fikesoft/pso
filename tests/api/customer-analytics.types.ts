import type { prepareCustomerAnalytics } from './customer-analytics-setup';
export type CustomerAnalyticsFixture = Awaited<ReturnType<typeof prepareCustomerAnalytics>>;
