import type {
  AttendanceActionRequest,
  AttendanceReportRow,
  AttendanceStartRequest,
  WorkShiftDto,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useAttendanceClock } from './use-attendance-clock';

export interface AttendanceWorkspaceProps {
  api: Api;
  locationId: string;
  userId: string;
  timezone?: string;
  locationName: (id: string) => string;
  canClock: boolean;
  canRead: boolean;
}
export type AttendanceClockProps = Pick<
  AttendanceWorkspaceProps,
  'api' | 'locationId' | 'userId' | 'timezone' | 'locationName'
>;
export type AttendanceCurrentResponse = { shift: WorkShiftDto | null; serverTime: string };
export type AttendanceHistoryResponse = {
  shifts: WorkShiftDto[];
  nextCursor: string | null;
  serverTime: string;
};
export type AttendanceReportResponse = {
  timezone: string;
  from: string;
  to: string;
  rows: AttendanceReportRow[];
  serverTime: string;
};
export type AttendanceMutation =
  | { kind: 'start'; body: AttendanceStartRequest }
  | { kind: 'action'; shiftId: string; body: AttendanceActionRequest };
export type AttendancePeriod = { from: string; to: string };
export type AttendanceClockModel = ReturnType<typeof useAttendanceClock>;
export interface AttendanceControlsProps {
  model: AttendanceClockModel;
}
