import { useCallback } from 'react';
import type { UpsellMetricsResponse, UpsellRuleDto } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import { useRemoteData } from '../../../shared/lib';

export function useUpsellMetrics(api: Api, locationId: string, rules: readonly UpsellRuleDto[]) {
  const ids = rules
    .map((rule) => rule.id)
    .sort()
    .join(',');
  return useRemoteData(
    useCallback(async () => {
      if (!ids) return { metrics: [], currency: 'MDL' } as UpsellMetricsResponse;
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      const metrics: UpsellMetricsResponse['metrics'] = [];
      const ruleIds = ids.split(',');
      for (let offset = 0; offset < ruleIds.length; offset += 100) {
        const { data } = await api.http.get<UpsellMetricsResponse>('/catalog/upsell-metrics', {
          params: {
            locationId,
            ruleIds: ruleIds.slice(offset, offset + 100).join(','),
            from: from.toISOString(),
            to: to.toISOString(),
          },
        });
        metrics.push(...data.metrics);
      }
      return { metrics, currency: 'MDL' } as UpsellMetricsResponse;
    }, [api, locationId, ids]),
  );
}
