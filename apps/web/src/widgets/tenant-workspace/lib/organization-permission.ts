import type { WorkspaceModel } from '../model/workspace.types';

export function canUseOrganization(model: WorkspaceModel, key: string) {
  return (
    !!model.actor.isPrimaryAdmin ||
    !!model.context?.permissions.some(
      (permission) =>
        typeof permission !== 'string' &&
        (permission.permission === key || permission.key === key) &&
        permission.scopeType === 'ORGANIZATION' &&
        permission.canUse !== false,
    )
  );
}
