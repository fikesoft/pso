export type ScopeType = 'ORGANIZATION' | 'LOCATION';
export type Limits = { maxAmount?: string; maxPercent?: string };
export type Permission = {
  key: string;
  label: string;
  scopeTypes: ScopeType[];
  delegable: boolean;
  privileged?: boolean;
};
export type PermissionItem = { permission: string; limits?: Limits };
export type Assignment = {
  id: string;
  issuedByUserId?: string;
  roleVersionId: string;
  scopeType: ScopeType;
  locationId?: string;
  delegationGrantId?: string;
};
export type Override = PermissionItem & {
  id: string;
  effect: 'ALLOW' | 'DENY';
  scopeType: ScopeType;
  locationId?: string;
};
export type Role = {
  id: string;
  name: string;
  description?: string;
  versions: { id: string; version: number; permissions: PermissionItem[] }[];
};
export type Grant = {
  id: string;
  userId: string;
  scopeType: ScopeType;
  locationId?: string;
  issuerUserId?: string;
  issuedByUserId?: string;
  status: string;
  permissions: PermissionItem[];
  createdAt?: string;
};
export type AccessEntry = {
  permission: string;
  label: string;
  canUse: boolean;
  canGrant: boolean;
  proposedCanUse?: boolean;
  source?: string | string[];
};
