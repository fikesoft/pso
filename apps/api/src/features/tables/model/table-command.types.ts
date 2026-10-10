import type {
  DiningTableCreateRequest,
  DiningTableUpdateRequest,
  DiningTableArchiveRequest,
} from '@pos/contracts';
export interface TableCommandIdentity {
  locationId: string;
  requestKey: string;
  kind: 'CREATE' | 'UPDATE' | 'ARCHIVE';
  tableId?: string;
}
export type TableMutation =
  | { kind: 'CREATE'; body: DiningTableCreateRequest }
  | { kind: 'UPDATE'; tableId: string; body: DiningTableUpdateRequest }
  | { kind: 'ARCHIVE'; tableId: string; body: DiningTableArchiveRequest };
export interface TableCursorContext {
  organizationId: string;
  actor: string;
  locationId: string;
  status: string;
}
