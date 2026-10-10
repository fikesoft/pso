import type {
  DiningTableCommandIdentity,
  TableVisitCommandIdentity,
  DiningTableCreateRequest,
  DiningTableUpdateRequest,
  DiningTableArchiveRequest,
  TableVisitOpenRequest,
  TableVisitCommandRequest,
  DiningTableMutationResponse,
  TableVisitMutationResponse,
} from '@pos/contracts/tables';
import type { Api } from '../../../shared/api';
import type { useTableOperation } from './use-table-operation';
export interface TableScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface TableAccessProps extends TableScope {
  api: Api;
  can: (permission: string) => boolean;
}
export type TableOperationIdentity =
  | { family: 'TABLE'; command: DiningTableCommandIdentity }
  | { family: 'VISIT'; command: TableVisitCommandIdentity };
export type TablePointer = TableScope & TableOperationIdentity;
export type TableAttempt =
  | { family: 'TABLE'; kind: 'CREATE'; body: DiningTableCreateRequest }
  | { family: 'TABLE'; kind: 'UPDATE'; tableId: string; body: DiningTableUpdateRequest }
  | { family: 'TABLE'; kind: 'ARCHIVE'; tableId: string; body: DiningTableArchiveRequest }
  | { family: 'VISIT'; kind: 'OPEN'; tableId: string; body: TableVisitOpenRequest }
  | { family: 'VISIT'; kind: 'COMMAND'; visitId: string; body: TableVisitCommandRequest };
export type TableOperationResult =
  | { family: 'TABLE'; result: DiningTableMutationResponse }
  | { family: 'VISIT'; result: TableVisitMutationResponse };
export interface TableOperationInput extends TableAccessProps {
  family: 'TABLE' | 'VISIT';
  isExternallyBlocked?: () => boolean;
  onSaved: (result?: TableOperationResult) => Promise<unknown>;
}
export type TableOperationModel = ReturnType<typeof useTableOperation>;
export interface TableStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
