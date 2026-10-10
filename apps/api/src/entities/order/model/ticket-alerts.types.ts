import type { KitchenAlertRule } from '@pos/contracts';
export interface TicketAlertRuleRow {
  scopeType: 'ORGANIZATION' | 'LOCATION';
  locationId: string | null;
  targetKind: 'DEFAULT' | 'STATION' | 'CATEGORY' | 'PRODUCT';
  stationId: string | null;
  categoryId: string | null;
  productId: string | null;
  resultVersion: number;
  warningSeconds: number | null;
  criticalSeconds: number | null;
}
export type TicketAlertRules = KitchenAlertRule[];
