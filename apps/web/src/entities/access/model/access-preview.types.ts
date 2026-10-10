import type { AccessEntry, PermissionItem, ScopeType } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export interface AccessPreviewProps {
  api: Api;
  scope: ScopeType;
  locationId: string;
  userId?: string;
  permissions?: PermissionItem[];
  effect?: 'ALLOW' | 'DENY';
  simulate?: boolean;
  onPreview?: (entries: AccessEntry[]) => void;
}
