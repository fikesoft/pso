import type { CourierAcceptanceResolution } from '@pos/contracts';
import type { CourierWorkProps } from './courier-work.types';
import type { useAcceptance } from './use-acceptance';
export interface AcceptanceScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export type AcceptancePointer = AcceptanceScope & CourierAcceptanceResolution & { orderId: string };
export interface AcceptanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface AcceptanceInput extends CourierWorkProps {
  enabled: boolean;
  onSettled: () => Promise<void>;
  onInvalidated: () => void;
}
export type AcceptanceModel = ReturnType<typeof useAcceptance>;
export interface AcceptanceRecoveryProps {
  command: AcceptanceModel;
}
