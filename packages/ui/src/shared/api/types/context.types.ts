import type { ScopeType } from './access.types';
import type { Organization, Location } from './organization.types';
import type { User } from './identity.types';
export type Context = {
  organization: Organization;
  user: User;
  locations: Location[];
  permissions: (
    | string
    | {
        permission?: string;
        key?: string;
        scopeType?: ScopeType;
        locationId?: string;
        canUse?: boolean;
        canGrant?: boolean;
      }
  )[];
};
