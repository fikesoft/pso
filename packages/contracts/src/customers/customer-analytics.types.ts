import type { z } from 'zod';
import type {
  customerAnalyticsQuerySchema,
  customerAnalyticsMetricsSchema,
  customerAnalyticsResponseSchema,
} from './customer-analytics.schema';
export type CustomerAnalyticsQuery = z.output<typeof customerAnalyticsQuerySchema>;
export type CustomerAnalyticsMetrics = z.output<typeof customerAnalyticsMetricsSchema>;
export type CustomerAnalyticsResponse = z.output<typeof customerAnalyticsResponseSchema>;
