import type { Api } from '../../../shared/api';
import type { PublishRoleVersionRequest, CreateRoleRequest } from '../model/role-request.types';
export function publishRoleVersion(api: Api, roleId: string, payload: PublishRoleVersionRequest) {
  return api.http.post(`/roles/${roleId}/versions`, payload);
}
export function createRole(api: Api, payload: CreateRoleRequest) {
  return api.http.post('/roles', payload);
}
