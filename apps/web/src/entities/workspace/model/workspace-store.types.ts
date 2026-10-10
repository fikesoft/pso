import type { makeStore } from './workspace.store';
export type WorkspaceStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<WorkspaceStore['getState']>;
