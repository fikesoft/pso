import type { Session, User, Location, Role, Grant } from '@pos/ui/types';
import type { Api } from '../../../shared/api';

export interface WorkspaceInput {
  session: Session;
  api: Api;
  logout: () => Promise<void>;
  invalidateRevoked: () => void;
}

export type WorkspaceModal =
  | { kind: 'location'; value?: Location }
  | { kind: 'staff'; value?: User }
  | { kind: 'role'; value?: Role }
  | { kind: 'delegation'; value?: never }
  | { kind: 'role-history'; value: Role }
  | { kind: 'revoke'; value: Grant }
  | {
      kind:
        | 'person'
        | 'access'
        | 'reset'
        | 'reset-pin'
        | `remove-assignment:${string}`
        | `remove-override:${string}`;
      value: User;
    };
