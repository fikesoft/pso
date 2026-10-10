import type {
  CreateMenuSchedule,
  MenuSchedulesResponse,
  MenuScheduleResponse,
  UpdateMenuSchedule,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';

export async function readSchedules(api: Api, locationId: string, cursor?: string) {
  return (
    await api.http.get<MenuSchedulesResponse>('/catalog/menu-schedules', {
      params: { locationId, cursor, includeArchived: true },
    })
  ).data;
}
export async function readSchedule(api: Api, id: string) {
  return (await api.http.get<MenuScheduleResponse>(`/catalog/menu-schedules/${id}`)).data.schedule;
}
export async function createSchedule(api: Api, body: CreateMenuSchedule) {
  return (await api.http.post<MenuScheduleResponse>('/catalog/menu-schedules', body)).data.schedule;
}
export async function updateSchedule(api: Api, id: string, body: UpdateMenuSchedule) {
  return (await api.http.patch<MenuScheduleResponse>(`/catalog/menu-schedules/${id}`, body)).data
    .schedule;
}
