import { PERMISSIONS } from './config/permissions.constants.js';
import type { PermissionDefinition } from './model/catalog.types.js';
export * from './config/permissions.constants.js';
export type * from './model/catalog.types.js';
export function getPermission(key: string): PermissionDefinition | undefined {
  return PERMISSIONS.find((permission) => permission.key === key);
}
