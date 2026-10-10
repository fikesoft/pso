import type { z } from 'zod';
import type { billCollectionSchema, billPartCommandIdentitySchema } from './bill-collection.schema';
export type BillCollectionRequest = z.infer<typeof billCollectionSchema>;
export interface BillPaymentPreview {
  partId: string;
  locationId: string;
  outstandingAmount: string;
  sources: Array<{ orderId: string; version: number; outstandingAmount: string }>;
}
export interface BillCollectionResult {
  id: string;
  partId: string;
  locationId: string;
  requestKey: string;
  amount: string;
  method: 'CASH' | 'CARD';
  receivedAmount: string;
  cashShiftId: string;
  actorUserId: string;
  createdAt: string;
  operations: Array<{ orderId: string; operationId: string; amount: string }>;
}

export type BillPartCommandIdentity = z.infer<typeof billPartCommandIdentitySchema>;
