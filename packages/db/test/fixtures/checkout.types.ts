import type { Prisma } from '../../src/index';
import type { prepareCheckoutOrder } from './checkout.fixture';

export type CheckoutOrder = Awaited<ReturnType<typeof prepareCheckoutOrder>>;
export type CheckoutOverrides = Partial<Prisma.CheckoutUncheckedCreateInput>;
export type CheckoutWriteOptions = {
  skipPayment?: boolean;
  skipInventory?: boolean;
  skipCompletion?: boolean;
  payment?: Partial<Prisma.PaymentUncheckedCreateInput>;
};
