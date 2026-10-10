import type { ScopeType, PermissionItem } from '@pos/ui/types';
export interface PreviewAccessRequest {
  userId?: string;
  scopeType: ScopeType;
  locationId?: string;
  permissions?: PermissionItem[];
  effect?: 'ALLOW' | 'DENY';
}
