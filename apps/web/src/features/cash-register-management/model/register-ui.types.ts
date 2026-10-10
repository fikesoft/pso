import type { useRegisterCommand } from './use-register-command';
import type { RegisterEdit } from './register-management.types';
export type RegisterCommandModel = ReturnType<typeof useRegisterCommand>;
export interface RegisterRecoveryProps {
  command: RegisterCommandModel;
  enabled: boolean;
}
export interface RegisterFormProps {
  edit: RegisterEdit;
  locationId: string;
  command: RegisterCommandModel;
  enabled: boolean;
  onCancel: () => void;
  onRefresh: () => Promise<void>;
}
