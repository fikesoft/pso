import { useCallback, useState } from 'react';
import { Button, Field, Notice, Select } from '@pos/ui';
import { tableMessages as text } from '@pos/ui/locales';
import { readTableMap } from '../../../entities/table';
import { useRemoteData } from '../../../shared/lib';
import type { VisitActionsProps } from '../model/table-service.types';
export function VisitMove({ detail, operation, ...props }: VisitActionsProps) {
  const [cursor, setCursor] = useState<string>();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const tables = useRemoteData(
    useCallback(
      () => readTableMap(props.api, { locationId: props.locationId, cursor }),
      [props.api, props.locationId, cursor],
    ),
  );
  const blocked = props.blocked || operation.locked || tables.loading || !!tables.error;
  const selected = tables.data?.tables.find(
    (row) => row.table.id === target && row.state === 'FREE',
  );
  return (
    <details className="form-stack">
      <summary>{text.move}</summary>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked || !selected || !confirmed || reason.trim().length < 3) return;
          void operation.send({
            family: 'VISIT',
            kind: 'COMMAND',
            visitId: detail.visit.id,
            body: {
              kind: 'MOVED',
              locationId: props.locationId,
              version: detail.visit.version,
              requestKey: crypto.randomUUID(),
              targetTableId: target,
              reason,
            },
          });
        }}
      >
        <p>{text.moveHint}</p>
        {tables.error && <Notice>{tables.error}</Notice>}
        <Select
          label={text.moveTarget}
          value={target}
          disabled={blocked}
          onChange={(event) => {
            setTarget(event.target.value);
            setConfirmed(false);
          }}
        >
          <option value="">—</option>
          {!tables.error &&
            tables.data?.tables
              .filter((row) => row.state === 'FREE')
              .map((row) => (
                <option key={row.table.id} value={row.table.id}>
                  {row.table.code} · {row.table.name}
                </option>
              ))}
        </Select>
        <div className="inline">
          <Button
            type="button"
            variant="secondary"
            disabled={props.blocked || operation.locked}
            onClick={() => {
              setTarget('');
              setConfirmed(false);
              setCursor(undefined);
              void tables.refresh();
            }}
          >
            {text.refresh}
          </Button>
          {tables.data?.nextCursor && (
            <Button
              type="button"
              variant="secondary"
              disabled={blocked}
              onClick={() => {
                setTarget('');
                setConfirmed(false);
                setCursor(tables.data!.nextCursor!);
              }}
            >
              {text.more}
            </Button>
          )}
        </div>
        <Field
          label={text.moveReason}
          value={reason}
          required
          minLength={3}
          maxLength={500}
          disabled={blocked}
          onChange={(event) => setReason(event.target.value)}
        />
        {selected && (
          <p>
            {detail.visit.tableCode} → {selected.table.code} · {selected.table.name}
          </p>
        )}
        <label className="inline">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={blocked || !selected}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          {text.moveConfirm}
        </label>
        <Button
          type="submit"
          disabled={blocked || !selected || !confirmed || reason.trim().length < 3}
        >
          {text.move}
        </Button>
      </form>
    </details>
  );
}
