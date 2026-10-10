export type ScopeType = 'ORGANIZATION' | 'LOCATION';

export interface PermissionDefinition {
  readonly key: string;
  readonly label: string;
  readonly scopeTypes: readonly ScopeType[];
  readonly delegable: boolean;
  readonly privileged: boolean;
  readonly supportedLimits?: readonly ('maxAmount' | 'maxPercent')[];
}

import type { PERMISSIONS } from '../config/permissions.constants.js';
export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
