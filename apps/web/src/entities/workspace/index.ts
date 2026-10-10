export {
  makeStore,
  setContext,
  setView,
  addDraft,
  clearDraft,
  clearWorkspace,
} from './model/workspace.store';
export type { RootState } from './model/workspace-store.types';
export type { DraftItem } from './model/workspace.types';

export { Credential } from './ui/credential';
export type { IssuedCredential } from './model/credential.types';
