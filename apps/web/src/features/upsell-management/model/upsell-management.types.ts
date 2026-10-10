import type { Api } from '../../../shared/api';
import type { useUpsellRules } from './use-upsell-rules';
export interface UpsellManagementProps {
  api: Api;
  locationId: string;
  locationName: string;
}
export interface UpsellDialogProps extends UpsellManagementProps {
  model: ReturnType<typeof useUpsellRules>;
}
import type { UpsellRuleMetrics } from '@pos/contracts';
export interface UpsellMetricsProps {
  metrics?: UpsellRuleMetrics;
}
