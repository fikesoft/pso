import type { PackingSessionDto } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { PackingAttempt, usePackingOperation } from '../../../entities/packing';
export interface PackingBoardProps {
  api: Api;
  organizationId: string;
  actorUserId: string;
  actorName: string;
  locationId: string;
  locationName: string;
  can: (permission: string) => boolean;
}
export interface PackingCardProps {
  session: PackingSessionDto;
  locked: boolean;
  canUpdate: boolean;
  canComplete: boolean;
  send: (attempt: PackingAttempt) => Promise<boolean>;
}
export interface PackingRecoveryProps {
  operation: ReturnType<typeof usePackingOperation>;
}
