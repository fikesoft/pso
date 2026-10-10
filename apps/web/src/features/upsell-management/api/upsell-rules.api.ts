import type {
  CreateUpsellRule,
  UpdateUpsellRule,
  UpsellRuleDto,
  UpsellRulesResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readRules(api: Api, locationId: string, cursor?: string) {
  return (
    await api.http.get<UpsellRulesResponse>('/catalog/upsell-rules', {
      params: { locationId, includeArchived: true, ...(cursor ? { cursor } : {}) },
    })
  ).data;
}
export async function readRule(api: Api, id: string) {
  return (await api.http.get<{ rule: UpsellRuleDto }>(`/catalog/upsell-rules/${id}`)).data.rule;
}
export async function createRule(api: Api, body: CreateUpsellRule) {
  return (await api.http.post<{ rule: UpsellRuleDto }>('/catalog/upsell-rules', body)).data.rule;
}
export async function updateRule(api: Api, id: string, body: UpdateUpsellRule) {
  return (await api.http.patch<{ rule: UpsellRuleDto }>(`/catalog/upsell-rules/${id}`, body)).data
    .rule;
}
