import { upsellMessages as text } from '@pos/ui/locales';
import type { UpsellMetricsProps } from '../model/upsell-management.types';
export function UpsellMetrics({ metrics }: UpsellMetricsProps) {
  if (!metrics) return null;
  return (
    <dl className="detail-grid" aria-label={text.metrics}>
      <div>
        <dt>{text.shown}</dt>
        <dd>{metrics.shown}</dd>
      </div>
      <div>
        <dt>{text.accepted}</dt>
        <dd>{metrics.accepted}</dd>
      </div>
      <div>
        <dt>{text.conversion}</dt>
        <dd>{metrics.conversionPercent}%</dd>
      </div>
      <div>
        <dt>{text.revenue}</dt>
        <dd>{metrics.revenue === null ? text.revenueRestricted : `${metrics.revenue} MDL`}</dd>
      </div>
    </dl>
  );
}
