import { Badge, Button, Notice } from '@pos/ui';
import { paymentMessages as text } from '@pos/ui/locales';
import type { OrderPaymentsProps } from '../model/payments.types';
import { PaymentForm } from './payment-form';
import { PaymentLedger } from './payment-ledger';

export function OrderPayments(props: OrderPaymentsProps) {
  const { model, order, canCollect, disabled } = props;
  const summary = order.paymentSummary;
  const eligible =
    order.status !== 'DRAFT' && order.status !== 'CANCELLED' && order.checkout?.mode !== 'DEMO';
  return (
    <section className="form-stack" aria-label={text.title}>
      <div className="operation-card-heading">
        <strong>{text.title}</strong>
        <Badge>{text.statuses[summary.status]}</Badge>
      </div>
      <p>
        {text.net}: <strong>{summary.netPaidAmount} MDL</strong> · {text.due}:{' '}
        <strong>{summary.outstandingAmount} MDL</strong>
      </p>
      {summary.refundedAmount !== '0.00' && (
        <p>
          {text.collected}: {summary.collectedAmount} MDL · {text.refunded}:{' '}
          {summary.refundedAmount} MDL
        </p>
      )}
      {(model.error || model.history.error) && (
        <Notice>{model.error || model.history.error}</Notice>
      )}
      {model.notice && <Notice tone="info">{model.notice}</Notice>}
      {order.checkout?.mode === 'DEMO' && <p className="scope-hint">{text.demoHint}</p>}
      {model.form ? (
        <PaymentForm model={model} />
      ) : (
        <>
          <div className="form-footer">
            {eligible && canCollect && summary.outstandingAmount !== '0.00' && (
              <Button disabled={disabled || model.locked} onClick={() => model.begin()}>
                {text.collect}
              </Button>
            )}
            <Button
              variant="secondary"
              busy={model.busy}
              disabled={disabled}
              onClick={() => void model.refresh()}
            >
              {text.refresh}
            </Button>
          </div>
          <PaymentLedger {...props} canRefund={props.canRefund && eligible} />
        </>
      )}
    </section>
  );
}
