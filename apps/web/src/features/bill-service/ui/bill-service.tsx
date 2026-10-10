import { useEffect, useRef } from 'react';
import { Badge, Button, Loading, Notice } from '@pos/ui';
import { billSplitMessages as text } from '@pos/ui/locales';
import type { BillServiceProps } from '../model/bill-service.types';
import { useBillService } from '../model/use-bill-service';
import { BillRecovery } from './bill-recovery';
import { BillPlanForm } from './bill-plan-form';
import { BillDetails } from './bill-details';
export function BillService(props: BillServiceProps) {
  const model = useBillService(props);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (props.context) {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'start' });
    }
  }, [props.context?.kind, props.context?.id]);
  return (
    <section className="form-stack" aria-label={text.title}>
      <BillRecovery operation={model.plan} onRefresh={() => void model.refresh()} />
      <BillRecovery operation={model.collection} onRefresh={() => void model.refresh()} />
      {props.context && (
        <>
          <h2 ref={heading} tabIndex={-1}>
            {text.title}
          </h2>
          <p>{text.hint}</p>
          <div className="inline">
            <Button
              variant="secondary"
              disabled={model.pending || props.blocked}
              onClick={props.onClose}
            >
              {text.back}
            </Button>
            <Button
              variant="secondary"
              disabled={model.pending || props.blocked}
              busy={model.list.loading}
              onClick={() => void model.refresh()}
            >
              {text.refresh}
            </Button>
          </div>
          {model.list.error && <Notice>{model.list.error}</Notice>}
          {model.list.loading && <Loading />}
          {!model.list.error && (
            <>
              {!model.creating && (
                <Button
                  disabled={model.locked}
                  onClick={() => {
                    model.setSelectedId(undefined);
                    model.setCreating(true);
                    model.setPartId(undefined);
                  }}
                >
                  {text.newPlan}
                </Button>
              )}
              {model.creating && (
                <BillPlanForm
                  key={`${props.context.kind}:${props.context.id}`}
                  {...props}
                  context={props.context}
                  operation={model.plan}
                  disabled={props.blocked || model.collection.locked}
                  onClose={() => model.setCreating(false)}
                />
              )}
              {!model.list.loading && model.list.data?.splits.length === 0 && <p>{text.empty}</p>}
              {!model.creating &&
                model.list.data?.splits.map((split) => (
                  <article key={split.id} data-bill-id={split.id} className="operation-order-card">
                    <p>
                      <strong>{split.total} MDL</strong> ·{' '}
                      {new Date(split.createdAt).toLocaleString('ro-MD')}
                    </p>
                    <Badge>{split.status === 'ACTIVE' ? text.active : text.voided}</Badge>
                    <Button
                      variant="secondary"
                      disabled={model.locked}
                      onClick={() => {
                        model.setSelectedId(split.id);
                        model.setPartId(undefined);
                      }}
                    >
                      {text.details}
                    </Button>
                  </article>
                ))}
              {model.list.data?.nextCursor && (
                <Button
                  disabled={model.locked}
                  busy={model.list.loadingMore}
                  onClick={() => void model.more()}
                >
                  {text.more}
                </Button>
              )}
            </>
          )}
          {model.selectedId && !model.creating && (
            <>
              {model.detail.loading && <Loading />}
              {model.detail.error && <Notice>{model.detail.error}</Notice>}
              {!model.detail.loading && !model.detail.error && model.detail.data && (
                <BillDetails model={model} props={props} split={model.detail.data} />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
