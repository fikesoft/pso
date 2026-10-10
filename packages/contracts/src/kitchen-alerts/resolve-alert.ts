import { DEFAULT_KITCHEN_ALERT_THRESHOLDS } from './config/alerts.constants';
import type {
  EffectiveKitchenAlert,
  KitchenAlertContext,
  KitchenAlertRule,
  KitchenAlertSeverity,
  KitchenAlertThresholds,
} from './alerts.types';

function rulePriority(rule: KitchenAlertRule, context: KitchenAlertContext) {
  if (rule.thresholds === null) return -1;
  const local = rule.scope.scopeType === 'LOCATION';
  if (
    local &&
    rule.scope.scopeType === 'LOCATION' &&
    rule.scope.locationId !== context.locationId
  ) {
    return -1;
  }
  switch (rule.target.kind) {
    case 'PRODUCT':
      return rule.target.productId === context.productId ? 6 + Number(local) : -1;
    case 'CATEGORY':
      return rule.target.categoryId === context.categoryId ? 4 + Number(local) : -1;
    case 'STATION':
      return local && rule.target.stationId === context.stationId ? 3 : -1;
    case 'DEFAULT':
      return local ? 2 : 1;
  }
}

// The caller supplies rules from one authorized organization only.
// Persistence must enforce one current rule per scope and target.
export function resolveKitchenAlert(
  rules: readonly KitchenAlertRule[],
  context: KitchenAlertContext,
): EffectiveKitchenAlert {
  let selected: KitchenAlertRule | undefined;
  let priority = -1;
  for (const rule of rules) {
    const candidate = rulePriority(rule, context);
    if (candidate > priority) {
      selected = rule;
      priority = candidate;
    }
  }
  return selected?.thresholds
    ? {
        thresholds: { ...selected.thresholds },
        source: { scope: selected.scope, target: selected.target },
      }
    : { thresholds: { ...DEFAULT_KITCHEN_ALERT_THRESHOLDS }, source: null };
}

export function kitchenAlertSeverity(
  elapsedSeconds: number,
  thresholds: KitchenAlertThresholds,
): KitchenAlertSeverity {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError('Durata trebuie să fie un număr finit pozitiv sau zero.');
  }
  if (elapsedSeconds >= thresholds.criticalSeconds) return 'CRITICAL';
  if (elapsedSeconds >= thresholds.warningSeconds) return 'WARNING';
  return 'NORMAL';
}
