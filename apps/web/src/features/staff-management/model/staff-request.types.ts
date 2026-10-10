import type { ScopeType, AuthenticationMethod } from '@pos/ui/types';
export interface EmployeeFieldsRequest {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  employeeCode: string | null;
  hireDate: string | null;
}
export interface UpdateStaffRequest extends EmployeeFieldsRequest {
  displayName: string;
  status: string;
  locationIds: string[];
  version: number;
}
export interface CreateStaffRequest extends EmployeeFieldsRequest {
  displayName: string;
  login: string;
  password?: string;
  authenticationMethod: AuthenticationMethod;
  pin?: string;
  locationIds: string[];
  managedByUserId?: string;
  assignments?: { roleVersionId: string; scopeType: ScopeType; locationId?: string }[];
}
export interface StaffCredentialResponse {
  temporaryPassword?: string;
  pin?: string;
}
