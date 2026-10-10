import { kitchenAlertMessages as text } from '@pos/ui/locales';
import type { KitchenSeverityProps } from '../model/kitchen-board.types';
export function KitchenSeverity({ severity }: KitchenSeverityProps) {
  if (!severity) return null;
  return (
    <span className={`kitchen-alert kitchen-alert-${severity.toLowerCase()}`}>
      {severity === 'CRITICAL'
        ? text.critical
        : severity === 'WARNING'
          ? text.warning
          : text.normal}
    </span>
  );
}
