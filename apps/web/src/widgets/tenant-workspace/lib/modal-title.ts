import { workspaceModalTitles } from '../config/modal-titles.constants';
import type { WorkspaceModal } from '../model/workspace-input.types';

export function workspaceModalTitle(modal: WorkspaceModal | null) {
  if (!modal) return workspaceModalTitles.revokeDelegation;
  if (modal.kind.startsWith('remove-assignment:')) return workspaceModalTitles.removeAssignment;
  if (modal.kind.startsWith('remove-override:')) return workspaceModalTitles.removeOverride;
  switch (modal.kind) {
    case 'location':
      return modal.value ? workspaceModalTitles.editLocation : workspaceModalTitles.createLocation;
    case 'staff':
      return modal.value ? workspaceModalTitles.editStaff : workspaceModalTitles.createStaff;
    case 'role':
      return modal.value
        ? workspaceModalTitles.publishRoleVersion
        : workspaceModalTitles.createRole;
    case 'delegation':
      return workspaceModalTitles.createDelegation;
    case 'role-history':
      return workspaceModalTitles.roleHistory;
    case 'person':
      return modal.value.displayName;
    case 'access':
      return workspaceModalTitles.editAccess;
    case 'reset-pin':
      return workspaceModalTitles.resetPin;
    case 'reset':
      return workspaceModalTitles.resetPassword;
    case 'revoke':
      return workspaceModalTitles.revokeDelegation;
    default:
      return workspaceModalTitles.revokeDelegation;
  }
}
