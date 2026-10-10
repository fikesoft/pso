import { z } from 'zod';
import { idSchema } from '../shared/validation';
import { businessDateSchema } from '../shared/model/business-date.schema';
import {
  CASH_DISCREPANCY_FILTERS,
  CASH_DISCREPANCY_MAX_DAYS,
} from './config/cash-discrepancy.constants';
const shape = {
  locationId: idSchema,
  closedFrom: businessDateSchema,
  closedTo: businessDateSchema,
  discrepancy: z.enum(CASH_DISCREPANCY_FILTERS).default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(2048).optional(),
};
function validInterval(value: { closedFrom: string; closedTo: string }) {
  const days =
    (Date.parse(`${value.closedTo}T00:00:00Z`) - Date.parse(`${value.closedFrom}T00:00:00Z`)) /
      86400000 +
    1;
  return days >= 1 && days <= CASH_DISCREPANCY_MAX_DAYS;
}
export const cashDiscrepancyQuerySchema = z
  .object({ ...shape, registerId: idSchema.optional() })
  .strict()
  .refine(validInterval, 'Intervalul trebuie să fie ordonat și să conțină cel mult 366 de zile.');
export const cashDiscrepancyRegisterQuerySchema = z
  .object(shape)
  .strict()
  .refine(validInterval, 'Intervalul trebuie să fie ordonat și să conțină cel mult 366 de zile.');
