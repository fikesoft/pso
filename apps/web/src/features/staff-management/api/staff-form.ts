import type { Api } from '../../../shared/api';
import type {
  UpdateStaffRequest,
  CreateStaffRequest,
  StaffCredentialResponse,
} from '../model/staff-request.types';
export function updateStaff(api: Api, userId: string, payload: UpdateStaffRequest) {
  return api.http.patch(`/staff/${userId}`, payload);
}
export function createStaff(api: Api, payload: CreateStaffRequest) {
  return api.http.post<StaffCredentialResponse>('/staff', payload);
}
