import { useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import { orderResponsibilityCommandSchema } from '@pos/contracts/order-responsibilities';
import { orderResponsibilityMessages as text } from '@pos/ui/locales';
import type { ResponsibilityFormProps } from '../model/responsibility-management.types';
export function ResponsibilityForm({
  row,
  kind,
  target,
  actorUserId,
  locationId,
  command,
  blocked,
  onBack,
}: ResponsibilityFormProps) {
  const [reason, setReason] = useState(''),
    [managerReason, setManagerReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const manager = kind === 'PREPARE_HANDOFF' && row.responsibility.owner?.userId !== actorUserId;
  const title =
    kind === 'ASSIGN' ? text.assign : kind === 'PREPARE_HANDOFF' ? text.prepare : text.accept;
  const locked = blocked || command.busy || command.blocked || command.stale;
  const validTarget =
    kind === 'PREPARE_HANDOFF'
      ? !!row.responsibility.shift
      : !!target &&
        target.status === 'OPEN' &&
        target.ownerUserId === actorUserId &&
        (kind !== 'ACCEPT_HANDOFF' ||
          (target.registerId === row.responsibility.shift?.registerId &&
            target.id !== row.responsibility.shift?.id));
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (locked || !confirmed || !validTarget) return;
        const base = {
          locationId,
          requestKey: crypto.randomUUID(),
          orderVersion: row.order.version,
          responsibilityVersion: row.responsibility.version,
          reason,
        };
        const parsed = orderResponsibilityCommandSchema.safeParse(
          kind === 'ASSIGN'
            ? { ...base, kind, targetShiftId: target?.id }
            : kind === 'PREPARE_HANDOFF'
              ? {
                  ...base,
                  kind,
                  sourceShiftId: row.responsibility.shift?.id,
                  ...(manager ? { managerReason } : {}),
                }
              : {
                  ...base,
                  kind,
                  targetShiftId: target?.id,
                  handoffEventId: row.responsibility.pendingEventId,
                },
        );
        if (!parsed.success || (manager && managerReason.trim().length < 3)) {
          setError(text.invalid);
          return;
        }
        setError('');
        void command.send({ orderId: row.order.id, body: parsed.data });
      }}
    >
      <h4>{title}</h4>
      {kind === 'PREPARE_HANDOFF' ? (
        <>
          <p>
            {text.destination}: {row.responsibility.shift?.registerCode} ·{' '}
            {row.responsibility.shift?.registerName}
          </p>
          <p>{text.pendingHint}</p>
        </>
      ) : (
        <p>
          {text.shift}:{' '}
          {target
            ? `${target.registerCode} · ${target.registerName} · ${target.ownerDisplayName}`
            : text.chooseShift}
        </p>
      )}
      {manager && <p>{text.managerHint}</p>}
      {error && <Notice>{error}</Notice>}
      <fieldset className="operation-fields" disabled={locked}>
        <Field
          label={text.reason}
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {manager && (
          <Field
            label={text.managerReason}
            required
            minLength={3}
            maxLength={500}
            value={managerReason}
            onChange={(event) => setManagerReason(event.target.value)}
          />
        )}
        <label className="check-option">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>{text.confirm}</span>
        </label>
      </fieldset>
      <div className="form-footer">
        <Button type="submit" disabled={locked || !confirmed || !validTarget}>
          {title}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={command.blocked || command.busy}
          onClick={onBack}
        >
          {text.cancel}
        </Button>
      </div>
    </form>
  );
}
