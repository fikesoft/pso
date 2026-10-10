import type { Permission, PermissionItem, ScopeType } from '@pos/ui/types';
export interface PermissionPickerProps {
  catalog: Permission[];
  value: PermissionItem[];
  onChange: (v: PermissionItem[]) => void;
  scope?: ScopeType;
  delegableOnly?: boolean;
}
