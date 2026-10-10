import type { ScopeType } from '@pos/ui/types';
export interface AssignRoleRequest {
  scopeType: ScopeType;
  locationId?: string;
  roleVersionId: string;
}
export interface CreateOverrideRequest {
  scopeType: ScopeType;
  locationId?: string;
  permission: string;
  effect: 'ALLOW' | 'DENY';
}
