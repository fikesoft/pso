import type { Courier, CourierResolution, CourierCandidateResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useCourierCommand } from './use-courier-command';
export interface CourierScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export type CourierPointer = CourierScope & CourierResolution & { courierId: string };
export interface CourierStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface CouriersProps extends CourierScope {
  api: Api;
  locationName: string;
  canRead: boolean;
  canManage: boolean;
  canOwn: boolean;
}
export type CourierFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';
export type CourierEdit =
  | { action: 'CREATE'; courierId: string }
  | { action: 'UPDATE' | 'ARCHIVE' | 'RESTORE' | 'SET_AVAILABILITY'; courier: Courier };
export interface CourierCommandInput extends CourierScope {
  api: Api;
  enabled: boolean;
  onSettled: () => Promise<void>;
  onInvalidated: () => void;
}
export type CourierCommandModel = ReturnType<typeof useCourierCommand>;
export interface CourierFormProps {
  api: Api;
  edit: CourierEdit;
  locationId: string;
  command: CourierCommandModel;
  onClose: () => void;
}
export interface CourierRecoveryProps {
  command: CourierCommandModel;
}
export interface CourierCardProps {
  courier: Courier;
  canManage: boolean;
  canSetAvailability: boolean;
  locked: boolean;
  onEdit: (edit: CourierEdit) => void;
}
export interface CourierCandidatesProps {
  data: CourierCandidateResponse | null;
  loading: boolean;
  error: string;
  value: string;
  onChange: (userId: string) => void;
  more: () => Promise<void>;
  disabled: boolean;
}
