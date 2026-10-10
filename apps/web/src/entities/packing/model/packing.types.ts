import type { PackingCommandInput, ResolvePackingCommandInput } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface PackingPointerScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface PackingPointer extends PackingPointerScope {
  command: ResolvePackingCommandInput;
}
export interface PackingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type PackingAttempt = PackingCommandInput & { sessionId: string };
export interface PackingOperationInput extends PackingPointerScope {
  api: Api;
  canUpdate: boolean;
  canComplete: boolean;
  onSaved: () => Promise<void>;
}
