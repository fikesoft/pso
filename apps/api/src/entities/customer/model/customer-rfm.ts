import { Prisma } from '@pos/db';
import { CUSTOMER_RFM_POLICY } from '@pos/contracts';
import type { CustomerAnalyticsMetrics, CustomerRfm } from '@pos/contracts';
import { CUSTOMER_ANALYTICS_DAY_MS } from '../config/customer-analytics.constants';

export function calculateCustomerRfm(metrics: CustomerAnalyticsMetrics, asOf: string): CustomerRfm {
  const frequency = metrics.completedOrders;
  const monetary = metrics.totalSpent;
  const base = { policyVersion: CUSTOMER_RFM_POLICY.version, frequency, monetary };
  if (frequency === 0) return { ...base, recencyDays: null, scores: null, segments: [] };
  const elapsed = Date.parse(asOf) - Date.parse(metrics.lastOrderAt ?? '');
  if (!Number.isFinite(elapsed) || elapsed < 0)
    throw new Error('Recența clientului nu aparține snapshotului.');
  const recencyDays = Math.floor(elapsed / CUSTOMER_ANALYTICS_DAY_MS);
  const recency = 5 - CUSTOMER_RFM_POLICY.recencyDays.filter((limit) => recencyDays > limit).length;
  const frequencyScore =
    1 + CUSTOMER_RFM_POLICY.frequencyMinimums.filter((limit) => frequency >= limit).length;
  const monetaryScore =
    1 +
    CUSTOMER_RFM_POLICY.monetaryMinimums.filter((limit) => new Prisma.Decimal(monetary).gte(limit))
      .length;
  const segments: CustomerRfm['segments'] = [];
  if (recency >= 4 && frequencyScore >= 4 && monetaryScore >= 4) segments.push('VIP');
  if (recency >= 3 && frequencyScore >= 4) segments.push('LOYAL');
  if (frequency === 1 && recencyDays <= 30) segments.push('NEW');
  if (recencyDays > 60 && recencyDays <= 90) segments.push('AT_RISK');
  if (recencyDays > 90) segments.push('LOST');
  if (monetaryScore >= 4) segments.push('HIGH_SPENDERS');
  if (frequencyScore >= 4) segments.push('FREQUENT');
  return {
    ...base,
    recencyDays,
    scores: { recency, frequency: frequencyScore, monetary: monetaryScore },
    segments,
  };
}
