import type {
  BillSplitCreateRequest,
  BillSplitVoidRequest,
  BillCollectionRequest,
  BillPlanCommandIdentity,
  BillPartCommandIdentity,
  BillSplitDto,
  BillCollectionResult,
} from '@pos/contracts/bill-splits';
import type { Api } from '../../../shared/api';
import type { useBillOperation } from './use-bill-operation';
export interface BillScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface BillAccessProps extends BillScope {
  api: Api;
  can: (permission: string) => boolean;
}
export type BillOperationIdentity =
  | { family: 'PLAN'; command: BillPlanCommandIdentity }
  | { family: 'COLLECTION'; command: BillPartCommandIdentity };
export type BillPointer = BillScope & BillOperationIdentity;
export type BillAttempt =
  | { family: 'PLAN'; kind: 'CREATE'; body: BillSplitCreateRequest }
  | { family: 'PLAN'; kind: 'VOID'; splitId: string; body: BillSplitVoidRequest }
  | { family: 'COLLECTION'; partId: string; body: BillCollectionRequest };
export type BillOperationResult =
  | { family: 'PLAN'; result: { split: BillSplitDto } }
  | { family: 'COLLECTION'; result: { collection: BillCollectionResult } };
export interface BillOperationInput extends BillAccessProps {
  family: 'PLAN' | 'COLLECTION';
  isExternallyBlocked?: () => boolean;
  onSaved: (result?: BillOperationResult) => Promise<unknown>;
}
export type BillOperationModel = ReturnType<typeof useBillOperation>;
export interface BillStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
export type BillOperationResolution =
  | { status: 'SUCCEEDED'; command: BillOperationIdentity; result: BillOperationResult }
  | { status: 'RETIRED'; command: BillOperationIdentity };
