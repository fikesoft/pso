import type {
  KitchenAlertRule,
  KitchenAlertPreviewResponse,
  KitchenAlertScope,
  KitchenAlertTarget,
  EffectiveKitchenAlert,
} from '@pos/contracts/kitchen-alerts';
import type { AlertAccessProps, useAlertOperation } from '../../../entities/kitchen-alert';
export interface AlertConfigurationProps extends AlertAccessProps {
  onBack: () => void;
}
export type AlertOperation = ReturnType<typeof useAlertOperation>;
export interface AlertTargetPickerProps {
  api: AlertAccessProps['api'];
  scope: KitchenAlertScope;
  kind: Exclude<KitchenAlertTarget['kind'], 'DEFAULT'>;
  disabled: boolean;
  selectedId: string;
  onSelect: (target: KitchenAlertTarget | null) => void;
}
export interface AlertFormProps {
  rule: KitchenAlertRule;
  preview: KitchenAlertPreviewResponse;
  operation: AlertOperation;
}
export interface AlertSourceProps {
  label: string;
  value: EffectiveKitchenAlert;
}
