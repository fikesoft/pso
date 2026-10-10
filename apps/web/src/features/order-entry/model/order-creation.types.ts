import type { Order } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface OrderCreationScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface OrderCreationPointer extends OrderCreationScope {
  requestKey: string;
}
export interface OrderCreationInput extends OrderCreationScope {
  api: Api;
  enabled: boolean;
  onSaved: (order: Order) => Promise<void>;
  onSettled: () => void;
}
export interface CreationPointerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
