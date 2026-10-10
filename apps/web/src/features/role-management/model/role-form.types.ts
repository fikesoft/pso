import type { Permission, Role } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export interface RoleFormProps {
  api: Api;
  role?: Role;
  catalog: Permission[];
  onSaved: () => void;
}
