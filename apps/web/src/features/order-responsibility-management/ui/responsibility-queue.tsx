import { Button, Loading, Notice, PageTitle, Select } from '@pos/ui';
import { orderResponsibilityMessages as text } from '@pos/ui/locales';
import type {
  ResponsibilityQueueProps,
  ResponsibilityView,
} from '../model/responsibility-management.types';
import { ResponsibilityShiftSelect } from './responsibility-shift-select';
export function ResponsibilityQueue({ model, onOpen, disabled }: ResponsibilityQueueProps) {
  if (!model.allowed) return null;
  const locked = disabled || model.command.blocked || model.command.busy;
  return (
    <section className="form-stack">
      <PageTitle title={text.title} description={text.description} />
      <p>{text.readRequired}</p>
      <Select
        label={text.queue}
        value={model.view}
        disabled={locked}
        onChange={(event) => {
          model.setView(event.target.value as ResponsibilityView);
          model.shifts.setId('');
        }}
      >
        <option value="UNASSIGNED">{text.unassigned}</option>
        <option value="ASSIGNED">{text.assigned}</option>
        <option value="INCOMING">{text.incoming}</option>
        <option value="OUTGOING">{text.outgoing}</option>
      </Select>
      {model.view === 'ASSIGNED' && model.input.can('orders.handoff-others') && (
        <>
          <Select
            label={text.sourceMode}
            value={model.manager ? 'MANAGER' : 'MINE'}
            disabled={locked}
            onChange={(event) => model.setManager(event.target.value === 'MANAGER')}
          >
            <option value="MINE">{text.mine}</option>
            <option value="MANAGER">{text.managerial}</option>
          </Select>
          {model.manager && !model.input.can('cash.reports.read') && (
            <Notice>{text.reportRequired}</Notice>
          )}
        </>
      )}
      <ResponsibilityShiftSelect model={model} disabled={locked} />
      {!model.query && <p>{text.choose}</p>}
      {model.list.loading && <Loading />}
      {model.list.error && <Notice>{model.list.error}</Notice>}
      {model.list.data && (
        <>
          {!model.list.data.orders.length && (
            <p>{model.list.data.nextCursor ? text.continuation : text.empty}</p>
          )}
          <div className="operation-order-list">
            {model.list.data.orders.map((row) => (
              <article className="operation-order-card cash-record" key={row.order.id}>
                <h3>
                  {text.order} #{row.order.number}
                </h3>
                <p>
                  {text.outstanding}: {row.order.outstandingAmount} MDL
                </p>
                <p>
                  {text.states[row.responsibility.state]} · {text.provenance[row.provenance.kind]}
                </p>
                <p>
                  {row.responsibility.state === 'PENDING_HANDOFF' ? text.pendingOwner : text.owner}:{' '}
                  {row.responsibility.owner?.displayName ?? text.noOwner}
                </p>
                {row.responsibility.shift && (
                  <p>
                    {row.responsibility.shift.registerCode} ·{' '}
                    {row.responsibility.shift.registerName}
                  </p>
                )}
                {row.responsibility.preparedReason && (
                  <p>
                    {text.preparedReason}: {row.responsibility.preparedReason}
                  </p>
                )}
                <Button variant="secondary" disabled={locked} onClick={() => onOpen(row.order.id)}>
                  {text.details}
                </Button>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="form-footer">
        <Button
          variant="secondary"
          disabled={locked || model.list.loading}
          onClick={() => void model.list.refresh()}
        >
          {text.refresh}
        </Button>
        {model.list.data?.nextCursor && (
          <Button
            variant="secondary"
            disabled={locked || model.list.loading}
            onClick={() => void model.list.more()}
          >
            {text.more}
          </Button>
        )}
      </div>
    </section>
  );
}
