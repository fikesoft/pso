import type { IssuedCredential } from '../../../entities/workspace';
import type { Location, Role, User, Permission } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export interface StaffFormProps {
  api: Api;
  user?: User;
  users: User[];
  locations: Location[];
  roles: Role[];
  catalog: Permission[];
  onSaved: () => void;
  onCredential: (v: IssuedCredential) => void;
}
