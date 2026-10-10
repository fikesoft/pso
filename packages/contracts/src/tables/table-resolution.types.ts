import type { DiningTableCommandIdentity, TableVisitCommandIdentity } from './table-input.types';
import type { DiningTableMutationResponse, TableVisitMutationResponse } from './table.types';
export type DiningTableResolutionResponse =
  | {
      status: 'SUCCEEDED';
      command: DiningTableCommandIdentity;
      result: DiningTableMutationResponse;
    }
  | { status: 'RETIRED'; command: DiningTableCommandIdentity };
export type TableVisitResolutionResponse =
  | { status: 'SUCCEEDED'; command: TableVisitCommandIdentity; result: TableVisitMutationResponse }
  | { status: 'RETIRED'; command: TableVisitCommandIdentity };
