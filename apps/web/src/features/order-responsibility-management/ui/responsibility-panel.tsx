import { Button, Loading, Notice } from '@pos/ui';
import { orderResponsibilityMessages as text } from '@pos/ui/locales';
import type { ResponsibilityPanelProps } from '../model/responsibility-management.types';
import { ResponsibilityForm } from './responsibility-form';
import { ResponsibilityHistory } from './responsibility-history';
import { ResponsibilityShiftSelect } from './responsibility-shift-select';
export function ResponsibilityPanel({ model, blocked }: ResponsibilityPanelProps) {
  const row = model.detail.data;
  if (!model.allowed) return null;
  if (!row)
    return (
      <>
        {model.detail.loading && <Loading />}
        {model.detail.error && <Notice>{model.detail.error}</Notice>}
      </>
    );
  const can = model.input.can;
  const own = row.responsibility.owner?.userId === model.input.actorUserId;
  const rights = {
    ASSIGN: row.actions.assign && can('orders.handoff'),
    PREPARE_HANDOFF:
      row.actions.prepare &&
      (own ? can('orders.handoff') : can('orders.handoff-others') && can('cash.reports.read')),
    ACCEPT_HANDOFF: row.actions.accept && can('orders.handoff'),
  };
  const locked = blocked || model.command.blocked || model.command.busy || model.detail.loading;
  return (
    <section className="form-stack cash-record" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p>
        {text.states[row.responsibility.state]} · {text.provenance[row.provenance.kind]}
      </p>
      <p>
        {row.responsibility.state === 'PENDING_HANDOFF' ? text.pendingOwner : text.owner}:{' '}
        {row.responsibility.owner?.displayName ?? text.noOwner}
      </p>
      <p>
        {text.outstanding}: {row.order.outstandingAmount} MDL
      </p>
      {row.responsibility.preparedReason && (
        <p>
          {text.preparedReason}: {row.responsibility.preparedReason}
        </p>
      )}
      {row.disabledReason && <p>{text.disabled[row.disabledReason]}</p>}
      {model.detail.error && <Notice>{model.detail.error}</Notice>}
      {(rights.ASSIGN || rights.ACCEPT_HANDOFF) && (
        <ResponsibilityShiftSelect model={model} disabled={locked || !!model.form} />
      )}
      {!model.form && (
        <div className="form-footer">
          {rights.ASSIGN && (
            <Button
              disabled={locked || !model.shifts.selected}
              onClick={() => model.begin('ASSIGN')}
            >
              {text.assign}
            </Button>
          )}
          {rights.PREPARE_HANDOFF && (
            <Button disabled={locked} onClick={() => model.begin('PREPARE_HANDOFF')}>
              {text.prepare}
            </Button>
          )}
          {rights.ACCEPT_HANDOFF && (
            <Button
              disabled={locked || !model.shifts.selected}
              onClick={() => model.begin('ACCEPT_HANDOFF')}
            >
              {text.accept}
            </Button>
          )}
        </div>
      )}
      {model.form && (
        <ResponsibilityForm
          key={`${row.order.id}:${model.form}:${row.order.version}:${row.responsibility.version}`}
          row={row}
          kind={model.form}
          target={model.shifts.selected}
          actorUserId={model.input.actorUserId}
          locationId={model.input.locationId}
          command={model.command}
          blocked={blocked || !rights[model.form]}
          onBack={model.back}
        />
      )}
      <Button
        variant="secondary"
        disabled={model.command.blocked || model.command.busy || model.detail.loading}
        onClick={() => {
          model.command.reset();
          void model.detail.refresh();
        }}
      >
        {text.refresh}
      </Button>
      <ResponsibilityHistory model={model} />
    </section>
  );
}
