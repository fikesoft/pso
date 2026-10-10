import type { RealtimeConfigResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readRealtimeConfig(api: Api) {
  return (
    await api.http.get<RealtimeConfigResponse>('/realtime/config', {
      headers: { 'X-POS-Background': 'true' },
    })
  ).data;
}
