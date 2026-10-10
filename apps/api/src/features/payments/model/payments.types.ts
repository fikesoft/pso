import type { z } from 'zod';
import type { collectPaymentSchema, refundPaymentSchema } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';

export type PaymentCommand =
  | {
      kind: 'COLLECT';
      billPartId?: string;
      billCollectionId?: string;
      body: z.output<typeof collectPaymentSchema>;
    }
  | { kind: 'REFUND'; body: z.output<typeof refundPaymentSchema> };
export type StoredPaymentOperation = Awaited<
  ReturnType<TenantTransaction['paymentOperation']['create']>
>;
