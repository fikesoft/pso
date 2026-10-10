import { cashDiscrepancyQuerySchema } from '@pos/contracts/cash-discrepancies';
import type { DiscrepancyFields } from '../model/cash-discrepancy.types';
export function discrepancyQuery(locationId: string, fields: DiscrepancyFields) {
  return cashDiscrepancyQuerySchema.safeParse({
    locationId,
    closedFrom: fields.closedFrom,
    closedTo: fields.closedTo,
    discrepancy: fields.discrepancy,
    ...(fields.registerId ? { registerId: fields.registerId } : {}),
    limit: 50,
  });
}
