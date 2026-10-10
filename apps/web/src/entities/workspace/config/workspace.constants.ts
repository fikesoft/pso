import type { WorkspaceState } from '../model/workspace.types';
export const workspaceInitialState: WorkspaceState = {
  organizationId: '',
  locationId: '',
  view: 'overview',
  draft: [],
};
