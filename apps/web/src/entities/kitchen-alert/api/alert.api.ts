import type {
  KitchenAlertIdentity,
  KitchenAlertRule,
  KitchenAlertPreviewResponse,
  KitchenAlertOptionsRequest,
  KitchenAlertOptionsResponse,
  KitchenAlertSetRequest,
  KitchenAlertCommandIdentity,
  KitchenAlertResolutionResponse,
} from '@pos/contracts/kitchen-alerts';
import type { Api } from '../../../shared/api';
export async function readAlert(api: Api, identity: KitchenAlertIdentity) {
  const [rule, preview] = await Promise.all([
    api.http.post<{ rule: KitchenAlertRule }>('/kitchen-alerts/read', identity),
    api.http.post<KitchenAlertPreviewResponse>('/kitchen-alerts/preview', identity),
  ]);
  return { ...rule.data, ...preview.data };
}
export async function readAlertOptions(api: Api, body: KitchenAlertOptionsRequest) {
  return (await api.http.post<KitchenAlertOptionsResponse>('/kitchen-alerts/options', body)).data;
}
export async function sendAlert(api: Api, body: KitchenAlertSetRequest) {
  return (await api.http.put<{ rule: KitchenAlertRule }>('/kitchen-alerts', body)).data;
}
export async function resolveAlert(api: Api, command: KitchenAlertCommandIdentity) {
  return (
    await api.http.post<KitchenAlertResolutionResponse>(
      '/kitchen-alert-commands/resolution',
      command,
    )
  ).data;
}
