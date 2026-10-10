import type { PermissionItem } from '@pos/ui/types';
export interface PublishRoleVersionRequest {
  permissions: PermissionItem[];
}
export interface CreateRoleRequest extends PublishRoleVersionRequest {
  name: string;
  description: string;
}
