import { customerAnalyticsMessages as text } from '@pos/ui/locales';
import { tenantLocale } from '../../../shared/config';
import { CUSTOMER_ANALYTICS_MONEY_FIELDS } from '../config/customer-analytics.constants';
import type { CustomerAnalyticsMetricsProps } from '../model/customer-analytics.types';
import styles from './customer-analytics.module.css';

export function CustomerAnalyticsMetrics({ report }: CustomerAnalyticsMetricsProps) {
  const { metrics, timezone } = report;
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString(tenantLocale, { timeZone: timezone }) : text.unavailable;
  return (
    <>
      {!metrics.completedOrders && <p>{text.noHistory}</p>}
      <dl className={styles.metrics}>
        <div>
          <dt>{text.completedOrders}</dt>
          <dd>{metrics.completedOrders}</dd>
        </div>
        {CUSTOMER_ANALYTICS_MONEY_FIELDS.map((key) => (
          <div key={key}>
            <dt>{text[key]}</dt>
            <dd>{metrics[key] === null ? text.unavailable : `${metrics[key]} MDL`}</dd>
          </div>
        ))}
        <div>
          <dt>{text.firstOrderAt}</dt>
          <dd>{date(metrics.firstOrderAt)}</dd>
        </div>
        <div>
          <dt>{text.lastOrderAt}</dt>
          <dd>{date(metrics.lastOrderAt)}</dd>
        </div>
        <div>
          <dt>{text.ordersLast30Days}</dt>
          <dd>{metrics.ordersLast30Days}</dd>
        </div>
        <div>
          <dt>{text.averageDaysBetweenOrders}</dt>
          <dd>{metrics.averageDaysBetweenOrders ?? text.unavailable}</dd>
        </div>
      </dl>
      <div>
        <h4>{text.favoriteLocation}</h4>
        <p>
          {metrics.favoriteLocation
            ? `${metrics.favoriteLocation.name} · ${metrics.favoriteLocation.orderCount} ${metrics.favoriteLocation.orderCount === 1 ? text.order : text.orders}`
            : text.unavailable}
        </p>
      </div>
      <div>
        <h4>{text.favoriteProducts}</h4>
        {!metrics.favoriteProducts.length ? (
          <p>{text.unavailable}</p>
        ) : (
          <ul>
            {metrics.favoriteProducts.map((product) => (
              <li key={product.productId}>
                {product.productName} · {text.quantity}: {product.quantity} · {product.orderCount}{' '}
                {product.orderCount === 1 ? text.order : text.orders}
              </li>
            ))}
          </ul>
        )}
        <p className="section-note">{text.historicalHint}</p>
      </div>
    </>
  );
}
