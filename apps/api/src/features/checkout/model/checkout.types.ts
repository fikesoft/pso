import type { DemoCheckoutRequest, ManualCheckoutRequest } from '@pos/contracts';

export type CheckoutCommand =
  | { mode: 'DEMO'; body: DemoCheckoutRequest }
  | { mode: 'MANUAL'; body: ManualCheckoutRequest };

export interface CheckoutAmounts {
  method: 'CASH' | 'CARD' | null;
  receivedAmount: string | null;
  changeAmount: string | null;
}
