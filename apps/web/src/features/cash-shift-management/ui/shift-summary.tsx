import { cashShiftMessages as text, cashMovementMessages as movement } from '@pos/ui/locales';
import { closingCashComponents } from '../lib/closing-cash-components';
import { shiftSummaryFields } from '../config/summary.constants';
import type { ShiftSummaryProps } from '../model/shift-management.types';
export function ShiftSummary({ detail }: ShiftSummaryProps) {
  const closingCash = detail.closing ? closingCashComponents(detail.closing.summary) : null;
  return (
    <section className="form-stack" aria-label={text.summary}>
      <h3>{text.summary}</h3>
      <dl className="active-order-states">
        <div>
          <dt>{text.openingAmount}</dt>
          <dd>{detail.shift.openingAmount} MDL</dd>
        </div>
        {shiftSummaryFields.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{detail.summary[key]} MDL</dd>
          </div>
        ))}
        <div>
          <dt>{text.paidOrderCount}</dt>
          <dd>{detail.summary.paidOrderCount}</dd>
        </div>
        <div>
          <dt>{text.refundOperationCount}</dt>
          <dd>{detail.summary.refundOperationCount}</dd>
        </div>
      </dl>
      {detail.closing && (
        <section className="form-stack" aria-label={text.closing}>
          <h3>{text.closing}</h3>
          <p>
            {movement.cashIn}: {closingCash?.cashIn} MDL
          </p>
          <p>
            {movement.cashOut}: {closingCash?.cashOut} MDL
          </p>
          <p>
            {text.counted}: {detail.closing.countedCash}
          </p>
          <p>
            {text.difference}: {detail.closing.difference} MDL
          </p>
          <p>
            {text.closedBy}: {detail.closing.closedByDisplayName}
          </p>
          {detail.closing.discrepancyReason && (
            <p>
              {text.differenceReason}: {detail.closing.discrepancyReason}
            </p>
          )}
          {detail.closing.managerReason && (
            <p>
              {text.managerReason}: {detail.closing.managerReason}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
