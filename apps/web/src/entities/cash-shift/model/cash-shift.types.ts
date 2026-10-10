import type { Api } from '../../../shared/api';
import type { useOwnShiftSelection } from './use-own-shift-selection';
export interface OwnShiftSelectionInput {
  api: Api;
  locationId: string;
  actorUserId: string;
  enabled: boolean;
}
export type OwnShiftSelectionModel = ReturnType<typeof useOwnShiftSelection>;
export interface OwnShiftSelectorProps {
  model: OwnShiftSelectionModel;
  disabled?: boolean;
}
