import type { EmployeeProfileResponse } from '@pos/contracts';
import type { ReactNode } from 'react';
import type { Api } from '../../../shared/api';

export interface EmployeeProfileProps {
  api: Api;
  userId: string;
  locationId?: string;
  timezone?: string;
  onLockedChange?: (locked: boolean) => void;
  renderImage?: (
    user: Profile['user'],
    refresh: () => Promise<void>,
    onLockedChange: (locked: boolean) => void,
  ) => ReactNode;
}
export type ProfilePeriod = { from: string; to: string };
export type Profile = EmployeeProfileResponse['profile'];
export interface ProfileDetailsProps {
  profile: Profile;
}
