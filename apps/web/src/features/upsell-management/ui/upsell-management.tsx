import { Button, Empty, Loading, Notice, PageTitle } from '@pos/ui';
import { upsellMessages as text, operationalMessages as common } from '@pos/ui/locales';
import { useUpsellRules } from '../model/use-upsell-rules';
import type { UpsellManagementProps } from '../model/upsell-management.types';
import { UpsellDialog } from './upsell-dialog';
import { useUpsellMetrics } from '../model/use-upsell-metrics';
import { UpsellMetrics } from './upsell-metrics';

export function UpsellManagement(props: UpsellManagementProps) {
  const model = useUpsellRules(props);
  const { rules } = model;
  const metrics = useUpsellMetrics(props.api, props.locationId, rules.data?.rules ?? []);
  return (
    <section className="stack">
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        <Button
          variant="secondary"
          busy={rules.loading || metrics.loading}
          onClick={() => void Promise.all([rules.refresh(), metrics.refresh()])}
        >
          {common.refresh}
        </Button>
        <Button onClick={() => model.edit(null)}>{text.newRule}</Button>
      </PageTitle>
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {rules.error && <Notice>{rules.error}</Notice>}
      {metrics.error && <Notice>{metrics.error}</Notice>}
      {!!rules.data?.rules.length && <p className="scope-hint">{text.metricsHint}</p>}
      {rules.loading ? (
        <Loading />
      ) : rules.error ? null : !rules.data?.rules.length ? (
        <Empty title={text.noRules} description={text.noRulesHint} />
      ) : (
        <div className="stack">
          {rules.data.rules.map((rule) => (
            <article className="panel panel-body stack" key={rule.id}>
              <strong>{rule.name}</strong>
              <p>
                {rule.sourceProductName} → {rule.targetProductName}
              </p>
              <UpsellMetrics
                metrics={metrics.data?.metrics.find((value) => value.ruleId === rule.id)}
              />
              <p>
                {rule.status === 'ACTIVE' ? common.active : common.archived} · {text.sortOrder}:{' '}
                {rule.sortOrder}
              </p>
              <Button
                variant="secondary"
                aria-label={`${text.editRule}: ${rule.name}`}
                onClick={() => model.edit(rule)}
              >
                {common.edit}
              </Button>
            </article>
          ))}
        </div>
      )}
      {rules.data?.nextCursor && (
        <Button variant="secondary" busy={rules.loadingMore} onClick={() => void model.more()}>
          {common.more}
        </Button>
      )}
      <UpsellDialog {...props} model={model} />
    </section>
  );
}
