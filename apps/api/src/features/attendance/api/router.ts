import { Router } from 'express';
import { attendanceMutationRouter } from './mutation.routes';
import { attendanceReadRouter } from './read.routes';
import { attendanceReportRouter } from './report.routes';

export function attendanceRouter() {
  return Router().use(attendanceReadRouter(), attendanceMutationRouter(), attendanceReportRouter());
}
