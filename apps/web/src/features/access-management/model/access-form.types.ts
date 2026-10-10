import type { Location, Permission, Role, User } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export interface AccessFormProps {
  api: Api;
  user: User;
  locations: Location[];
  roles: Role[];
  catalog: Permission[];
  onSaved: () => void;
}
