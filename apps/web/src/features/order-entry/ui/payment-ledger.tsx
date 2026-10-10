import { Button } from '@pos/ui';
import { paymentMessages as text } from '@pos/ui/locales';
import type { OrderPaymentsProps } from '../model/payments.types';
import { tenantLocale, defaultTimezone } from '../../../shared/config';

export function PaymentLedger({ model, canRefund, disabled }: OrderPaymentsProps) {
  const history = model.history.data;
  return (
    <>
      <details>
        <summary>{text.history}</summary>
        <div className="order-draft-items">
          {!history?.payments?.payments.length && <p>{text.empty}</p>}
          {history?.payments?.payments.map((payment) => (
            <article
              className="order-draft-item"
              key={payment.id}
              aria-label={`${text.operationCollected} ${payment.method === 'CASH' ? text.cash : text.card} · ${payment.amount} MDL`}
            >
              <strong>
                {payment.method === 'CASH' ? text.cash : text.card} · {payment.amount} MDL
              </strong>
              <p>
                <time dateTime={payment.createdAt}>
                  {new Date(payment.createdAt).toLocaleString(tenantLocale, {
                    timeZone: defaultTimezone,
                  })}
                </time>
              </p>
              {payment.changeAmount !== null && (
                <p>
                  {text.change}: {payment.changeAmount} MDL
                </p>
              )}
              <p>
                {text.refunded}: {payment.refundedAmount} MDL · {text.refundable}:{' '}
                {payment.refundableAmount} MDL
              </p>
              {canRefund && payment.refundableAmount !== '0.00' && (
                <Button
                  variant="secondary"
                  disabled={disabled || model.locked}
                  onClick={() => model.begin(payment)}
                >
                  {text.refund}
                </Button>
              )}
            </article>
          ))}
        </div>
        {history?.payments?.nextCursor && (
          <Button
            variant="secondary"
            busy={model.history.loadingMore}
            onClick={() => void model.morePayments()}
          >
            {text.morePayments}
          </Button>
        )}
      </details>
      <details>
        <summary>{text.operations}</summary>
        <div className="order-draft-items">
          {history?.operations?.operations.map((operation) => (
            <article className="order-draft-item" key={operation.id}>
              <strong>
                {operation.kind === 'COLLECT' ? text.operationCollected : text.operationRefunded} ·{' '}
                {operation.amount} MDL
              </strong>
              <p>
                {text.statuses[operation.fromStatus]} → {text.statuses[operation.toStatus]}
              </p>
              <p>
                <time dateTime={operation.createdAt}>
                  {new Date(operation.createdAt).toLocaleString(tenantLocale, {
                    timeZone: defaultTimezone,
                  })}
                </time>
              </p>
              {operation.reason && <p>{operation.reason}</p>}
            </article>
          ))}
        </div>
        {history?.operations?.nextCursor && (
          <Button
            variant="secondary"
            busy={model.history.loadingMore}
            onClick={() => void model.moreOperations()}
          >
            {text.moreOperations}
          </Button>
        )}
      </details>
    </>
  );
}
