import type { CourierWorkItem, DeliveryResolution, DeliveryProof } from '@pos/contracts';
import type { useTransition } from './use-transition';
import type {
  AcceptanceScope,
  AcceptanceStorage,
  AcceptanceInput,
} from './courier-acceptance.types';
export type TransitionScope = AcceptanceScope;
export type TransitionStorage = AcceptanceStorage;
export type TransitionInput = AcceptanceInput;
export type TransitionPointer = TransitionScope & DeliveryResolution & { orderId: string };
export type TransitionModel = ReturnType<typeof useTransition>;
export interface TransitionRecoveryProps {
  command: TransitionModel;
}
export interface CourierDeliveryActionsProps {
  order: CourierWorkItem;
  command: TransitionModel;
}

export interface SignaturePadProps {
  value: DeliveryProof['signature'];
  onChange(value: DeliveryProof['signature']): void;
  disabled: boolean;
}
