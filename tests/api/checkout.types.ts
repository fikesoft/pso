import type { prepareCheckout } from './checkout-setup';

export type CheckoutFixture = Awaited<ReturnType<typeof prepareCheckout>>;
export type CheckoutActor = 'cashier' | 'waiter' | 'limited' | 'denied' | 'noRead';
export interface CheckoutPermission {
  permission: string;
  limits?: { maxAmount: string };
}
