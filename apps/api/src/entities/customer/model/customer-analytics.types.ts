import type { Prisma } from '@pos/db';
export interface CustomerAnalyticsOrder {
  id: string;
  locationId: string;
  total: string;
  createdAt: Date;
  collectedAmount: string;
  refundedAmount: string;
  items: { productId: string; productName: string; quantity: string }[];
}
export interface CustomerAnalyticsProduct {
  productId: string;
  productName: string;
  quantity: Prisma.Decimal;
  orderCount: number;
  latestAt: number;
  latestOrderId: string;
}
export interface CustomerAnalyticsLocation {
  locationId: string;
  name: string;
  orderCount: number;
  totalSpent: Prisma.Decimal;
}
export interface CustomerAnalyticsReadInput {
  organizationId: string;
  customerId: string;
  locations: { id: string; name: string }[];
  canRead: (locationId: string, total: string) => boolean;
}
export interface CustomerAnalyticsPayments {
  orderId: string;
  collectedAmount: string;
  refundedAmount: string;
}
