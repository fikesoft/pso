import type { ActiveTenantSession } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useSessionManagement } from './use-session-management';

export interface SessionManagementProps {
  api: Api;
  userId: string;
  currentUserId: string;
  onCurrentSessionRevoked: () => void | Promise<void>;
}

export type SessionManagementModel = ReturnType<typeof useSessionManagement>;
export interface SessionComponentProps {
  model: SessionManagementModel;
}
export type RevocationTarget = ActiveTenantSession | 'all' | null;
