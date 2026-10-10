import type { User, AuthenticationMethod } from '@pos/ui/types';
export interface StaffCredentialsProps {
  users: User[];
  method: AuthenticationMethod;
  setMethod: (method: AuthenticationMethod) => void;
  requiresPassword: boolean;
}
