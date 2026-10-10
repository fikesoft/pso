import type { z } from 'zod';
import type {
  attendanceActionSchema,
  attendanceCurrentQuerySchema,
  attendanceReportQuerySchema,
  attendanceShiftsQuerySchema,
  attendanceStartSchema,
} from './attendance.schema';

export type AttendanceCurrentQuery = z.infer<typeof attendanceCurrentQuerySchema>;
export type AttendanceStartRequest = z.infer<typeof attendanceStartSchema>;
export type AttendanceActionRequest = z.infer<typeof attendanceActionSchema>;
export type AttendanceShiftsQuery = z.infer<typeof attendanceShiftsQuerySchema>;
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>;
export type { AttendanceShiftStatus, AttendanceRoleSnapshot, WorkShiftDto } from '../shared';
export type AttendanceReportRow = {
  userId: string;
  displayName: string;
  daysWorked: number;
  workedSeconds: number;
  breakSeconds: number;
  shiftCount: number;
};
