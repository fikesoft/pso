import type { z } from 'zod';
import type {
  billSplitCreateSchema,
  billSplitPreviewSchema,
  billContextSchema,
  billSplitVoidSchema,
  billPlanResolutionSchema,
  billSplitListSchema,
} from './bill-split.schema';
export type BillSplitVoidRequest = z.infer<typeof billSplitVoidSchema>;
export type BillContext = z.infer<typeof billContextSchema>;
export type BillSplitPreviewRequest = z.infer<typeof billSplitPreviewSchema>;
export type BillSplitCreateRequest = z.infer<typeof billSplitCreateSchema>;
export interface BillSourceDto {
  orderId: string;
  number: number;
  version: number;
  amount: string;
}
export interface BillPartAllocationDto {
  orderId: string;
  amount: string;
}
export interface BillItemAllocationDto {
  orderId: string;
  orderItemId: string;
  quantity: string;
  amount: string;
}
export interface BillItemSourceDto extends BillItemAllocationDto {
  productName: string;
  position: number;
  note: string | null;
  modifiers: string[];
}
export interface BillPartPreviewDto {
  items?: BillItemAllocationDto[];
  position: number;
  amount: string;
  allocations: BillPartAllocationDto[];
}
export interface BillSplitPreviewDto {
  locationId: string;
  context: BillContext;
  visitVersion?: number;
  currency: 'MDL';
  total: string;
  sources: BillSourceDto[];
  sourceItems?: BillItemSourceDto[];
  parts: BillPartPreviewDto[];
}
export interface BillSplitDto extends BillSplitPreviewDto {
  requestKey: string;
  status: 'ACTIVE' | 'VOIDED';
  canVoid: boolean;
  voided: {
    id: string;
    requestKey: string;
    actorUserId: string;
    reason: string;
    createdAt: string;
  } | null;
  id: string;
  mode: 'EQUAL' | 'CUSTOM' | 'ITEMS';
  actorUserId: string;
  createdAt: string;
  parts: BillPartDto[];
}
export interface BillPartDto extends BillPartPreviewDto {
  id: string;
  netPaidAmount: string;
  outstandingAmount: string;
  allocations: Array<
    BillPartAllocationDto & {
      netPaidAmount: string;
      outstandingAmount: string;
    }
  >;
}

export type BillPlanCommandIdentity = z.infer<typeof billPlanResolutionSchema>;
export type BillPlanResolutionResponse =
  | { status: 'SUCCEEDED'; command: BillPlanCommandIdentity; result: { split: BillSplitDto } }
  | { status: 'RETIRED'; command: BillPlanCommandIdentity };

export type BillSplitListRequest = z.infer<typeof billSplitListSchema>;
export interface BillSplitListResponse {
  splits: BillSplitDto[];
  nextCursor: string | null;
}
