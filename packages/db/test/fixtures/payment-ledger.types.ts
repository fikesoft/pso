import type { Prisma } from '../../src';

export type LedgerTestCommand = {
  cashShiftId: string;
  payments?: Array<{ amount: string; method?: 'CASH' | 'CARD'; receivedAmount?: string }>;
  refunds?: Array<{ paymentId: string; amount: string; method?: 'CASH' | 'CARD' }>;
  omit?: 'lines' | 'order' | 'event';
  operation?: Partial<Prisma.PaymentOperationUncheckedCreateInput>;
  event?: Partial<Prisma.OrderStatusEventUncheckedCreateInput>;
};
