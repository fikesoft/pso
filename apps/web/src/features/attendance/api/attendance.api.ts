import type { Api } from '../../../shared/api';
import type {
  AttendanceCurrentResponse,
  AttendanceHistoryResponse,
  AttendanceMutation,
  AttendancePeriod,
  AttendanceReportResponse,
} from '../model/attendance.types';
import type { WorkShiftDto } from '@pos/contracts';

export async function readCurrent(api: Api, locationId: string) {
  return (
    await api.http.get<AttendanceCurrentResponse>('/attendance/current', { params: { locationId } })
  ).data;
}
export async function readHistory(api: Api, locationId: string, userId: string, cursor?: string) {
  return (
    await api.http.get<AttendanceHistoryResponse>('/attendance/shifts', {
      params: { locationId, userId, ...(cursor ? { cursor } : {}) },
    })
  ).data;
}
export async function readReport(api: Api, locationId: string, period: AttendancePeriod) {
  return (
    await api.http.get<AttendanceReportResponse>('/attendance/report', {
      params: { locationId, ...period },
    })
  ).data;
}
export async function mutateAttendance(api: Api, mutation: AttendanceMutation) {
  const path =
    mutation.kind === 'start'
      ? '/attendance/start'
      : `/attendance/shifts/${mutation.shiftId}/action`;
  return (await api.http.post<{ shift: WorkShiftDto }>(path, mutation.body)).data;
}
