import type { z } from 'zod';
import type {
  kitchenAlertCommandIdentitySchema,
  kitchenAlertOptionsSchema,
  kitchenAlertIdentitySchema,
  kitchenAlertScopeSchema,
  kitchenAlertSetSchema,
  kitchenAlertTargetSchema,
  kitchenAlertThresholdsSchema,
} from './alerts.schema';

export type KitchenAlertScope = z.infer<typeof kitchenAlertScopeSchema>;
export type KitchenAlertTarget = z.infer<typeof kitchenAlertTargetSchema>;
export type KitchenAlertIdentity = z.infer<typeof kitchenAlertIdentitySchema>;
export type KitchenAlertThresholds = z.infer<typeof kitchenAlertThresholdsSchema>;
export type KitchenAlertSetRequest = z.infer<typeof kitchenAlertSetSchema>;
export type KitchenAlertCommandIdentity = z.infer<typeof kitchenAlertCommandIdentitySchema>;
export type KitchenAlertOptionsRequest = z.infer<typeof kitchenAlertOptionsSchema>;
export interface KitchenAlertOptionsResponse {
  options: Array<{ id: string; name: string; code: string | null }>;
  nextCursor: string | null;
}
export interface KitchenAlertPreviewResponse {
  effective: EffectiveKitchenAlert;
  inherited: EffectiveKitchenAlert;
}
export type KitchenAlertResolutionResponse =
  | {
      status: 'SUCCEEDED';
      command: KitchenAlertCommandIdentity;
      result: { rule: KitchenAlertRule };
    }
  | { status: 'RETIRED'; command: KitchenAlertCommandIdentity };
export interface KitchenAlertRule extends KitchenAlertIdentity {
  version: number;
  thresholds: KitchenAlertThresholds | null;
}
export interface KitchenAlertContext {
  locationId: string;
  stationId: string | null;
  productId: string;
  categoryId: string | null;
}
export interface EffectiveKitchenAlert {
  thresholds: KitchenAlertThresholds;
  source: KitchenAlertIdentity | null;
}
export type KitchenAlertSeverity = 'NORMAL' | 'WARNING' | 'CRITICAL';
