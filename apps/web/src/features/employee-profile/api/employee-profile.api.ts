import type { EmployeeProfileResponse } from '@pos/contracts';
import type { EmployeeProfileProps, ProfilePeriod } from '../model/employee-profile.types';

export async function readEmployeeProfile(props: EmployeeProfileProps, period: ProfilePeriod) {
  return (
    await props.api.http.get<EmployeeProfileResponse>(`/staff/${props.userId}/profile`, {
      params: { ...(props.locationId ? { locationId: props.locationId } : {}), ...period },
    })
  ).data.profile;
}
