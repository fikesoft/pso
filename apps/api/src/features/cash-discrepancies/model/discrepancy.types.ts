import type { z } from 'zod';
import type { Prisma } from '@pos/db';
import type {
  cashDiscrepancyQuerySchema,
  cashDiscrepancyRegisterQuerySchema,
} from '@pos/contracts';
export type ParsedDiscrepancyQuery = z.output<typeof cashDiscrepancyQuerySchema>;
export type ParsedRegisterQuery = z.output<typeof cashDiscrepancyRegisterQuerySchema>;
export type DiscrepancyContext = ParsedDiscrepancyQuery & {
  organizationId: string;
  actor: string;
  timezone: string;
};
export type ReportClosing = Prisma.CashClosingGetPayload<Record<string, never>>;
