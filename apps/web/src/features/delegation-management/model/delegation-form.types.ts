import type { Location, Permission, User } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export interface DelegationFormProps {
  api: Api;
  users: User[];
  locations: Location[];
  catalog: Permission[];
  onSaved: () => void;
}
