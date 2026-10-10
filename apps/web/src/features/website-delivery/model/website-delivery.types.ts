import type {
  WebsiteApiKey,
  WebsiteConnection,
  WebsiteInboxOrder,
  WebsiteOrderDetails,
  WebsiteOrderStatus,
} from '@pos/contracts';
import type { Location } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
import type { useWebsiteConnections } from './use-website-connections';
import type { useWebsiteInbox } from './use-website-inbox';
import type { useWebsiteDecision } from './use-website-decision';

export interface WebsiteDeliveryProps {
  api: Api;
  locationId: string;
  locationName: string;
  locations: Location[];
  canManage: boolean;
  canRead: boolean;
  canDecide: boolean;
  onOpenOrders: () => void;
}
export interface WebsiteConnectionsProps {
  api: Api;
  locations: Location[];
  locationId: string;
}
export type WebsiteConnectionsModel = ReturnType<typeof useWebsiteConnections>;
export type WebsiteInboxModel = ReturnType<typeof useWebsiteInbox>;
export type WebsiteDecisionModel = ReturnType<typeof useWebsiteDecision>;
export type ConnectionDialog =
  | { kind: 'create' }
  | { kind: 'key'; connection: WebsiteConnection }
  | { kind: 'revoke'; key: WebsiteApiKey };
export interface WebsiteConnectionCardProps {
  connection: WebsiteConnection;
  model: WebsiteConnectionsModel;
}
export interface WebsiteConnectionFormProps {
  model: WebsiteConnectionsModel;
  locations: Location[];
  locationId: string;
}
export interface WebsiteKeysProps {
  connection: WebsiteConnection;
  model: WebsiteConnectionsModel;
}
export interface WebsiteConnectionModelProps {
  model: WebsiteConnectionsModel;
}
export interface WebsiteKeyFormProps extends WebsiteConnectionModelProps {
  connection: WebsiteConnection;
}
export interface WebsiteInboxProps {
  api: Api;
  locationId: string;
  canDecide: boolean;
  onOpenOrders: () => void;
}
export interface WebsiteInboxListProps {
  orders: WebsiteInboxOrder[];
  onOpen: (id: string) => void;
}
export interface WebsiteOrderDialogProps extends WebsiteInboxProps {
  id: string;
  onClose: () => void;
  onUpdated: () => void;
}
export interface WebsiteOrderInfoProps {
  order: WebsiteOrderDetails;
}
export interface WebsiteDecisionActionsProps {
  model: WebsiteDecisionModel;
  canDecide: boolean;
  onOpenOrders: () => void;
}
export interface WebsiteDecisionAttempt {
  kind: 'accept' | 'reject';
  version: number;
  reason?: string;
}
export type WebsiteStatusFilter = WebsiteOrderStatus | '';
