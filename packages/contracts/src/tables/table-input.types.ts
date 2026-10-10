import type { z } from 'zod';
import type {
  diningTableListSchema,
  diningTableCreateSchema,
  diningTableUpdateSchema,
  diningTableArchiveSchema,
  diningTableResolutionSchema,
  tableMapQuerySchema,
  tableVisitOpenSchema,
  tableVisitDetailSchema,
  tableVisitOrderQuerySchema,
  tableVisitHistorySchema,
  tableWaiterListSchema,
  tableVisitCommandSchema,
  tableVisitResolutionSchema,
} from './table.schema';
export type DiningTableListRequest = z.input<typeof diningTableListSchema>;
export type DiningTableCreateRequest = z.input<typeof diningTableCreateSchema>;
export type DiningTableUpdateRequest = z.input<typeof diningTableUpdateSchema>;
export type DiningTableArchiveRequest = z.input<typeof diningTableArchiveSchema>;
export type DiningTableResolutionRequest = z.input<typeof diningTableResolutionSchema>;
export type TableMapQueryRequest = z.input<typeof tableMapQuerySchema>;
export type TableVisitOpenRequest = z.input<typeof tableVisitOpenSchema>;
export type TableVisitDetailRequest = z.input<typeof tableVisitDetailSchema>;
export type TableVisitOrderQueryRequest = z.input<typeof tableVisitOrderQuerySchema>;
export type TableVisitHistoryRequest = z.input<typeof tableVisitHistorySchema>;
export type TableWaiterListRequest = z.input<typeof tableWaiterListSchema>;
export type TableVisitCommandRequest = z.input<typeof tableVisitCommandSchema>;
export type TableVisitResolutionRequest = z.input<typeof tableVisitResolutionSchema>;
export type DiningTableCommandIdentity = DiningTableResolutionRequest;
export type TableVisitCommandIdentity = TableVisitResolutionRequest;
