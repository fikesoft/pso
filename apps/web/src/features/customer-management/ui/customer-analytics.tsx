import { CustomerRfm } from './customer-rfm';
import styles from './customer-analytics.module.css';
import { useCallback, useState } from 'react';
import { Button, Loading, Notice, Select } from '@pos/ui';
import { customerAnalyticsMessages as text } from '@pos/ui/locales';
import { readCustomerAnalytics } from '../../../entities/customer';
import { useRemoteData } from '../../../shared/lib';
import { tenantLocale } from '../../../shared/config';
import type { CustomerAnalyticsProps } from '../model/customer-analytics.types';
import { CustomerAnalyticsMetrics } from './customer-analytics-metrics';

export function CustomerAnalytics({ api, customerId, locationId }: CustomerAnalyticsProps) {
  const [scope, setScope] = useState<'LOCATION' | 'ORGANIZATION'>('LOCATION');
  const load = useCallback(
    () =>
      readCustomerAnalytics(
        api,
        customerId,
        scope === 'LOCATION' ? { scopeType: scope, locationId } : { scopeType: scope },
      ),
    [api, customerId, locationId, scope],
  );
  const report = useRemoteData(load);
  function refresh() {
    report.setData(null);
    void report.refresh();
  }
  return (
    <section className={`form-stack ${styles.report}`} aria-label={text.title}>
      <h3>{text.title}</h3>
      <p className="section-note">{text.description}</p>
      <Select
        label={text.scope}
        value={scope}
        disabled={report.loading}
        onChange={(event) => {
          report.setData(null);
          setScope(event.target.value as typeof scope);
        }}
      >
        <option value="LOCATION">{text.local}</option>
        <option value="ORGANIZATION">{text.organization}</option>
      </Select>
      <Button variant="secondary" disabled={report.loading} onClick={refresh}>
        {text.refresh}
      </Button>
      {report.loading ? (
        <Loading />
      ) : report.error ? (
        <Notice>{report.error}</Notice>
      ) : (
        report.data && (
          <>
            <p>
              {text.coverage}: {report.data.locations.map((location) => location.name).join(', ')}
            </p>
            <p className="section-note">{text.coverageHint}</p>
            <p className="section-note">
              {text.asOf}:{' '}
              <time dateTime={report.data.asOf}>
                {new Date(report.data.asOf).toLocaleString(tenantLocale, {
                  timeZone: report.data.timezone,
                })}
              </time>
            </p>
            <CustomerAnalyticsMetrics report={report.data} />
            <CustomerRfm rfm={report.data.rfm} />
          </>
        )
      )}
    </section>
  );
}
