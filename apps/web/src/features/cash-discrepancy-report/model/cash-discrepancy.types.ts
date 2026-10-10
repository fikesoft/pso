import type { CashDiscrepancyRowDto } from '@pos/contracts/cash-discrepancies';
import type { Api } from '../../../shared/api';
import type { useCashDiscrepancies } from './use-cash-discrepancies';
export interface CashDiscrepancyProps {
  api: Api;
  organizationId: string;
  actorUserId: string;
  locationId: string;
  allowed: boolean;
}
export interface DiscrepancyFields {
  closedFrom: string;
  closedTo: string;
  discrepancy: 'ALL' | 'NONZERO';
  registerId: string;
}
export type DiscrepancyModel = ReturnType<typeof useCashDiscrepancies>;
export interface DiscrepancyCardProps {
  row: CashDiscrepancyRowDto;
  timezone: string;
}
