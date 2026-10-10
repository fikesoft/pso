import type {
  LocationFilter,
  ResetPasswordResponse,
  ResetPinResponse,
} from '../model/workspace-api.types';
import type { Context, User, Role, Permission, Grant, AuditEvent } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export const readContext = (api: Api) => api.http.get<Context>('/context');
export const readUsers = (api: Api, params: LocationFilter) =>
  api.http.get<{ users: User[] }>('/staff', { params });
export const readRoles = (api: Api, params: LocationFilter) =>
  api.http.get<{ roles: Role[] }>('/roles', { params });
export const readPermissions = (api: Api) =>
  api.http.get<{ permissions: Permission[] }>('/permissions');
export const readGrants = (api: Api, params: LocationFilter) =>
  api.http.get<{ grants: Grant[] }>('/delegations', { params });
export const readAudit = (api: Api, params: LocationFilter) =>
  api.http.get<{ events: AuditEvent[] }>('/audit', { params });
export const resetStaffPassword = (api: Api, id: string) =>
  api.http.post<ResetPasswordResponse>(`/staff/${id}/reset-password`, {});
export const revokeDelegation = (api: Api, id: string, reason: string) =>
  api.http.post(`/delegations/${id}/revoke`, { reason });
export const removeStaffAccess = (api: Api, userId: string, kind: string, id: string) =>
  api.http.delete(`/staff/${userId}/${kind}/${id}`);

export const resetStaffPin = (api: Api, id: string, pin?: string) =>
  api.http.post<ResetPinResponse>(`/staff/${id}/reset-pin`, pin ? { pin } : {});
