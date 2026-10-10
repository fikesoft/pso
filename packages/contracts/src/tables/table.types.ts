import type { OrderSummary } from '../orders';
export type DiningTableStatus = 'ACTIVE' | 'ARCHIVED';
export type TableVisitStatus = 'OPEN' | 'CLOSED' | 'MERGED';
export type TableMapState = 'FREE' | 'OCCUPIED' | 'WAITING_FOOD' | 'READY' | 'PAYMENT_REQUESTED';
export type TableVisitCommandKind =
  | 'OPEN'
  | 'GUEST_COUNT_CHANGED'
  | 'BILL_REQUESTED'
  | 'BILL_CANCELLED'
  | 'WAITER_CHANGED'
  | 'MERGED'
  | 'MERGE_RECEIVED'
  | 'MOVED'
  | 'CLOSE';
export interface DiningTableDto {
  id: string;
  locationId: string;
  code: string;
  name: string;
  capacity: number;
  sortOrder: number;
  status: DiningTableStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface TableWaiterDto {
  id: string;
  displayName: string;
}
export interface TableVisitDto {
  id: string;
  locationId: string;
  tableId: string;
  tableCode: string;
  tableName: string;
  status: TableVisitStatus;
  mergedIntoVisitId?: string | null;
  version: number;
  guestCount: number;
  waiter: TableWaiterDto;
  openedAt: string;
  closedAt: string | null;
  billRequested: boolean;
  billRequestedAt: string | null;
  billRequestEventId: string | null;
}
export interface TableVisitActions {
  changeGuests: boolean;
  requestBill: boolean;
  cancelBill: boolean;
  changeWaiter: boolean;
  close: boolean;
}
export interface TableVisitDetailResponse {
  visit: TableVisitDto;
  state: TableMapState;
  hasReadyFood: boolean;
  hasWaitingFood: boolean;
  actions: TableVisitActions;
  closeBlocked: boolean;
  // Nu order IDs/count/amount în closeBlocked; este disponibilitatea acțiunii de servire.
  timezone: string;
}
export interface TableMapRowDto {
  table: DiningTableDto;
  state: TableMapState;
  hasReadyFood: boolean;
  hasWaitingFood: boolean;
  visit: null | Pick<
    TableVisitDto,
    'id' | 'version' | 'guestCount' | 'waiter' | 'billRequested' | 'openedAt'
  >;
  actions: { open: boolean; view: boolean };
}
export interface TableVisitEventDto {
  id: string;
  locationId: string;
  visitId: string;
  tableId: string;
  kind: TableVisitCommandKind;
  actor: TableWaiterDto;
  previousVersion: number;
  result: TableVisitDto;
  previousTable?: { id: string; code: string; name: string } | null;
  relatedVisitId?: string | null;
  previousGuestCount: number | null;
  previousWaiter: TableWaiterDto | null;
  previousBillRequested: boolean | null;
  reason: string | null;
  createdAt: string;
}
export interface DiningTableMutationResponse {
  table: DiningTableDto;
}
export interface TableVisitMutationResponse {
  event: TableVisitEventDto;
}
export interface DiningTableListResponse {
  tables: DiningTableDto[];
  nextCursor: string | null;
  timezone: string;
}
export interface TableMapResponse {
  tables: TableMapRowDto[];
  nextCursor: string | null;
  timezone: string;
}
export interface TableWaiterListResponse {
  waiters: TableWaiterDto[];
  nextCursor: string | null;
}
export interface TableVisitHistoryResponse {
  events: TableVisitEventDto[];
  nextCursor: string | null;
  timezone: string;
}

export interface TableVisitOrdersResponse {
  orders: OrderSummary[];
  nextCursor: string | null;
  timezone: string;
}
