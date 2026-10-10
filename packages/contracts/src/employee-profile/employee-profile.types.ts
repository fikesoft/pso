import type { z } from 'zod';
import type { WorkShiftDto } from '../shared';
import type { employeeProfileQuerySchema } from './employee-profile.schema';

export type EmployeeProfileQuery = z.infer<typeof employeeProfileQuerySchema>;

export type EmployeeProfileUser = {
  id: string;
  organizationId: string;
  login: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  employeeCode: string | null;
  hireDate: string | null;
  avatarUrl: string | null;
  status: string;
  version: number;
};

export type EmployeeProfileLocation = { id: string; code: string; name: string };
export type EmployeeProfileRole = {
  assignmentId: string;
  roleId: string;
  roleName: string;
  roleVersion: number;
  scopeType: string;
  locationId: string | null;
};
export type EmployeeProfileShift = WorkShiftDto;
export type EmployeeProfileSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  authenticationMethod: 'PASSWORD' | 'PIN';
  current: boolean;
};
export type EmployeeProfileResponse = {
  profile: {
    user: EmployeeProfileUser;
    locations: EmployeeProfileLocation[];
    roles: EmployeeProfileRole[];
    attendance: {
      daysWorked: number;
      workedSeconds: number;
      breakSeconds: number;
      shiftCount: number;
      recentShifts: EmployeeProfileShift[];
    } | null;
    performance: {
      ordersCreated: number | null;
      ordersCancelled: number | null;
      paymentsHandled: number | null;
      revenueHandled: string | null;
      averageOrder: string | null;
      averageOrderOrders: number | null;
      currency: string | null;
      refunds: null;
      discounts: null;
      tips: null;
      bonuses: null;
      penalties: null;
      unsupported: {
        refunds: true;
        discounts: true;
        tips: true;
        bonuses: true;
        penalties: true;
        registeredDevices: true;
      };
    };
    sessions: { count: number; lastLoginAt: string | null; items: EmployeeProfileSession[] } | null;
    scope: { locationIds: string[]; from: string; to: string; timezone: string };
  };
};
