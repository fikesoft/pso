import { cashDiscrepancyMessages as text } from '@pos/ui/locales';
import { tenantLocale } from '../../../shared/config';
import type { DiscrepancyCardProps } from '../model/cash-discrepancy.types';
export function DiscrepancyCard({ row, timezone }: DiscrepancyCardProps) {
  const { shift, closing } = row;
  return (
    <article className="operation-order-card form-stack cash-record">
      <h3>
        {shift.registerCode} · {shift.registerName}
      </h3>
      <p>
        {text.owner}: {shift.ownerDisplayName}
      </p>
      <p>
        {text.closedBy}: {closing.closedByDisplayName}
      </p>
      <p>
        {text.closedAt}:{' '}
        {new Intl.DateTimeFormat(tenantLocale, {
          timeZone: timezone,
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(closing.closedAt))}
      </p>
      <dl className="active-order-states">
        <div>
          <dt>{text.expected}</dt>
          <dd>{closing.expectedCash} MDL</dd>
        </div>
        <div>
          <dt>{text.counted}</dt>
          <dd>{closing.countedCash} MDL</dd>
        </div>
        <div>
          <dt>{text.difference}</dt>
          <dd>
            {closing.difference} MDL{Number(closing.difference) === 0 ? ` · ${text.zero}` : ''}
          </dd>
        </div>
      </dl>
      {closing.discrepancyReason && (
        <p className="cash-reason">
          {text.reason}: {closing.discrepancyReason}
        </p>
      )}
      {closing.managerReason && (
        <p className="cash-reason">
          {text.managerReason}: {closing.managerReason}
        </p>
      )}
    </article>
  );
}
