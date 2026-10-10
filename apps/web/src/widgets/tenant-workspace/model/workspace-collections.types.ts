import type { Context } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export interface WorkspaceCollectionsInput {
  api: Api;
  context: Context | null;
  view: string;
  locationId: string;
  can: (permission: string) => boolean;
}
