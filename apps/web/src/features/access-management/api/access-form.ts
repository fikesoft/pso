import type { Api } from '../../../shared/api';
import type { AssignRoleRequest, CreateOverrideRequest } from '../model/access-request.types';
export function assignRole(api: Api, userId: string, payload: AssignRoleRequest) {
  return api.http.post(`/staff/${userId}/assignments`, payload);
}
export function createOverride(api: Api, userId: string, payload: CreateOverrideRequest) {
  return api.http.post(`/staff/${userId}/overrides`, payload);
}
