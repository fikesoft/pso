import type { BillPartAmount } from './bill-split.types';

export interface BillItemSource {
  orderId: string;
  orderItemId: string;
  quantity: string;
  amount: string;
}

export interface BillItemAssignment {
  orderItemId: string;
  quantity: string;
}

export interface BillItemDivision {
  mode: 'ITEMS';
  parts: { items: BillItemAssignment[] }[];
}

export type BillItemAllocation = BillItemSource;

export interface BillItemPart extends BillPartAmount {
  items: BillItemAllocation[];
}

export interface BillItemDistribution {
  total: string;
  parts: BillItemPart[];
}
