import type { ScopeType, PermissionItem } from '@pos/ui/types';
export interface CreateDelegationRequest {
  userId: string;
  scopeType: ScopeType;
  locationId?: string;
  permissions: PermissionItem[];
}
