import type {
  KitchenStationListRequest,
  KitchenStationListResponse,
  KitchenStationCreateRequest,
  KitchenStationUpdateRequest,
  KitchenStationArchiveRequest,
  KitchenStationMutationResponse,
  KitchenStationCommandIdentity,
  KitchenStationResolutionResponse,
} from '@pos/contracts/kitchen-stations';
import type { Api } from '../../../shared/api';
export async function readKitchenStations(api: Api, params: KitchenStationListRequest) {
  return (await api.http.get<KitchenStationListResponse>('/kitchen-stations', { params })).data;
}
export async function createKitchenStation(api: Api, body: KitchenStationCreateRequest) {
  return (await api.http.post<KitchenStationMutationResponse>('/kitchen-stations', body)).data;
}
export async function updateKitchenStation(
  api: Api,
  id: string,
  body: KitchenStationUpdateRequest,
) {
  return (await api.http.patch<KitchenStationMutationResponse>(`/kitchen-stations/${id}`, body))
    .data;
}
export async function archiveKitchenStation(
  api: Api,
  id: string,
  body: KitchenStationArchiveRequest,
) {
  return (
    await api.http.post<KitchenStationMutationResponse>(`/kitchen-stations/${id}/archive`, body)
  ).data;
}
export async function resolveKitchenStation(api: Api, command: KitchenStationCommandIdentity) {
  return (
    await api.http.post<KitchenStationResolutionResponse>(
      '/kitchen-station-commands/resolution',
      command,
    )
  ).data;
}
