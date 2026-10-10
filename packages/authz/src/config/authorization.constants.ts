import type { GrantDecision } from '../model/authorization.types.js';
export const NO_GRANT: GrantDecision = { allowed: false, delegationGrantId: null };
export const MANAGE_PERMISSIONS = {
  read: 'staff.read',
  create: 'staff.create',
  update: 'staff.manage',
  deactivate: 'staff.manage',
  activate: 'staff.manage',
  resetPassword: 'staff.credentials.reset',
  assignPermissions: 'staff.access',
} as const;
