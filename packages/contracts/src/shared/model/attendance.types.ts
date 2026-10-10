export type AttendanceShiftStatus = 'ACTIVE' | 'ON_BREAK' | 'ENDED';

export type AttendanceRoleSnapshot = {
  isPrimaryAdmin: boolean;
  assignments: Array<{
    assignmentId: string;
    roleId: string;
    roleVersionId: string;
    roleName: string;
    roleVersion: number;
    scopeType: 'ORGANIZATION' | 'LOCATION';
    locationId: string | null;
  }>;
};

export type WorkShiftDto = {
  id: string;
  userId: string;
  locationId: string;
  status: AttendanceShiftStatus;
  startedAt: string;
  endedAt: string | null;
  version: number;
  breaks: Array<{ id: string; startedAt: string; endedAt: string | null }>;
  workedSeconds: number;
  breakSeconds: number;
  roleSnapshot: AttendanceRoleSnapshot | null;
};
