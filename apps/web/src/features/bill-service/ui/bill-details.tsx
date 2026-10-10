import { BillItemLines } from './bill-item-lines';
import { Badge, Button } from '@pos/ui';
import { billSplitMessages as text } from '@pos/ui/locales';
import type { BillDetailsProps } from '../model/bill-service.types';
import { BillPaymentForm } from './bill-payment-form';
import { BillVoidForm } from './bill-void-form';
export function BillDetails({ model, props, split }: BillDetailsProps) {
  return (
    <section className="form-stack">
      <h3>
        {text.total}: {split.total} MDL
      </h3>
      <Badge>{split.status === 'ACTIVE' ? text.active : text.voided}</Badge>
      {split.voided && <p>{split.voided.reason}</p>}
      {split.sources.map((source) => (
        <p key={source.orderId}>
          {text.source} #{source.number}: {source.amount} MDL
        </p>
      ))}
      {split.parts.map((part) => (
        <article key={part.id} className="operation-order-card">
          <h4>
            {text.part} {part.position}: {part.amount} MDL
          </h4>
          <p>
            {text.paid}: {part.netPaidAmount} MDL · {text.due}: {part.outstandingAmount} MDL
          </p>
          <BillItemLines bill={split} items={part.items} />
          {model.partId === part.id ? (
            <BillPaymentForm
              key={part.id}
              {...props}
              partId={part.id}
              operation={model.collection}
              disabled={props.blocked || model.plan.locked}
              onClose={() => model.setPartId(undefined)}
            />
          ) : (
            split.status === 'ACTIVE' &&
            props.can('payments.collect') &&
            part.outstandingAmount !== '0.00' && (
              <Button
                disabled={model.locked || !!model.partId}
                onClick={() => model.setPartId(part.id)}
              >
                {text.collect} {part.position}
              </Button>
            )
          )}
        </article>
      ))}
      {split.canVoid && props.can('orders.split') && !model.partId && (
        <BillVoidForm key={split.id} split={split} operation={model.plan} disabled={model.locked} />
      )}
    </section>
  );
}
