import type { useWorkspace } from './use-workspace';
export type WorkspaceModel = ReturnType<typeof useWorkspace>;
export interface WorkspaceComponentProps {
  model: WorkspaceModel;
}
export interface PersonDetailsProps extends WorkspaceComponentProps {
  onLockedChange: (locked: boolean) => void;
  imageLocked: boolean;
}
export interface WorkspaceEmployeeProfileProps extends WorkspaceComponentProps {
  userId: string;
  editable: boolean;
  onLockedChange?: (locked: boolean) => void;
}
