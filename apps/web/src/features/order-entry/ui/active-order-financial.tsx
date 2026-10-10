import { activeOrderMessages as text, paymentMessages } from '@pos/ui/locales';
import type { ActiveOrderFinancialProps } from '../model/active-orders.types';

export function ActiveOrderFinancial({ order, showStatus = false }: ActiveOrderFinancialProps) {
  return (
    <>
      {showStatus && (
        <dl className="active-order-states">
          <div>
            <dt>{text.payment}</dt>
            <dd>{paymentMessages.statuses[order.paymentStatus]}</dd>
          </div>
        </dl>
      )}
      <p>
        {paymentMessages.net}: {order.paymentSummary.netPaidAmount} {order.currency}
      </p>
      {order.activeReasons.includes('PAYMENT_OUTSTANDING') && (
        <p>
          {text.outstanding}: {order.paymentSummary.outstandingAmount} {order.currency}
        </p>
      )}
      {order.activeReasons.includes('FINANCIAL_REVIEW') && (
        <p className="scope-hint">{text.review}</p>
      )}
    </>
  );
}
