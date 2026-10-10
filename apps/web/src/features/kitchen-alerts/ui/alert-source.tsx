import { kitchenAlertMessages as text } from '@pos/ui/locales';
import type { AlertSourceProps } from '../model/alert.types';
export function AlertSource({ label, value }: AlertSourceProps) {
  const source = value.source;
  const target = source?.target.kind;
  return (
    <p>
      <strong>{label}: </strong>
      {value.thresholds.warningSeconds} / {value.thresholds.criticalSeconds} s. {text.source}:{' '}
      {source ? (
        <>
          {source.scope.scopeType === 'ORGANIZATION' ? text.organization : text.location} ·{' '}
          {target === 'PRODUCT'
            ? text.product
            : target === 'CATEGORY'
              ? text.category
              : target === 'STATION'
                ? text.station
                : text.defaultTarget}
        </>
      ) : (
        text.applicationDefault
      )}
    </p>
  );
}
