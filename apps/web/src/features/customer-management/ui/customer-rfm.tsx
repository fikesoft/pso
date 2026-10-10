import type { CustomerRfmProps } from '../model/customer-analytics.types';
import { customerRfmMessages as text } from '@pos/ui/locales';
import styles from './customer-analytics.module.css';

export function CustomerRfm({ rfm }: CustomerRfmProps) {
  return (
    <section aria-label={text.title} className="form-stack">
      <h4>{text.title}</h4>
      <p className="section-note">{text.hint}</p>
      {rfm.scores ? (
        <>
          <dl className={styles.metrics}>
            <div>
              <dt>{text.recency}</dt>
              <dd>{rfm.recencyDays}</dd>
            </div>
            <div>
              <dt>{text.frequency}</dt>
              <dd>{rfm.frequency}</dd>
            </div>
            <div>
              <dt>{text.monetary}</dt>
              <dd>{rfm.monetary} MDL</dd>
            </div>
            <div>
              <dt>{text.scores}</dt>
              <dd>
                {rfm.scores.recency} / {rfm.scores.frequency} / {rfm.scores.monetary}
              </dd>
            </div>
          </dl>
          {rfm.segments.length ? (
            <ul>
              {rfm.segments.map((segment) => (
                <li key={segment}>{text.segments[segment]}</li>
              ))}
            </ul>
          ) : (
            <p>{text.noSegment}</p>
          )}
        </>
      ) : (
        <p>{text.noHistory}</p>
      )}
      <details>
        <summary>{text.policy}</summary>
        <p>{text.recencyRule}</p>
        <p>{text.frequencyRule}</p>
        <p>{text.monetaryRule}</p>
        <p>{text.segmentRule}</p>
      </details>
    </section>
  );
}
