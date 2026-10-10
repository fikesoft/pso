import type { z } from 'zod';
import type { CatalogProduct } from '../catalog';
import type { ModifierGroupSnapshotDto, ModifierSelectionInput } from '../shared';
import type { OrderStatus } from './orders.types';
import type { ORDER_REPEAT_ISSUE_CODES } from './config/order-repeat.constants';
import type { orderRepeatPreviewSchema, orderLastCustomerOrderQuerySchema } from './repeat.schema';
export interface OrderRepeatSource {
  id: string;
  number: number;
  locationId: string;
  status: OrderStatus;
  version: number;
  createdAt: string;
  total: string;
  currency: 'MDL';
}
export type OrderRepeatPreviewRequest = z.input<typeof orderRepeatPreviewSchema>;
export type OrderLastCustomerOrderRequest = z.input<typeof orderLastCustomerOrderQuerySchema>;
export type OrderRepeatIssueCode = (typeof ORDER_REPEAT_ISSUE_CODES)[number];
export interface OrderRepeatIssue {
  code: OrderRepeatIssueCode;
  blocking: boolean;
  bindingId?: string;
  optionId?: string;
}
export interface OrderRepeatCandidate {
  productId: string;
  quantity: string;
  courseNumber?: number;
  note?: string;
  modifiers?: ModifierSelectionInput[];
}
export interface OrderRepeatPreviewLine {
  sourceItemId: string;
  productId: string;
  historical: {
    productName: string;
    productSku: string;
    unitPrice: string;
    quantity: string;
    courseNumber?: number;
    note: string | null;
    modifierGroups: ModifierGroupSnapshotDto[];
  };
  candidate: OrderRepeatCandidate | null;
  currentUnitPrice: string | null;
  currentLineTotal: string | null;
  issues: OrderRepeatIssue[];
}
export interface OrderRepeatPreviewResponse {
  source: OrderRepeatSource;
  locationId: string;
  checkedAt: string;
  currency: 'MDL';
  products: CatalogProduct[];
  lines: OrderRepeatPreviewLine[];
  estimatedTotal: string | null;
  amountAllowed: boolean | null;
  canCreate: boolean;
}
export interface OrderLastCustomerOrderResponse {
  order: OrderRepeatSource | null;
  nextCursor: string | null;
}
