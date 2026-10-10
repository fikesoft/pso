import { safeUser } from '../../../entities/session';
import { avatarUrl } from '../../../entities/file-assets';
import type { StaffUser } from './staff.types';

/** HR fields appear only on authorized staff endpoints, never session DTOs. */
export function staffUserResponse(user: StaffUser) {
  return {
    ...safeUser(user),
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    email: user.email,
    employeeCode: user.employeeCode,
    hireDate: user.hireDate?.toISOString().slice(0, 10) ?? null,
    avatarUrl: avatarUrl(user.id, user.avatarAssetId),
  };
}
