import { useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import { tableMessages as text } from '@pos/ui/locales';
import { diningTableCreateSchema, diningTableUpdateSchema } from '@pos/contracts/tables';
import type { TableFormProps } from '../model/table-service.types';
export function TableForm({ edit, locationId, operation, onClose }: TableFormProps) {
  const table = edit.kind === 'CREATE' ? null : edit.table;
  const [code, setCode] = useState(table?.code ?? '');
  const [name, setName] = useState(table?.name ?? '');
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4));
  const [sortOrder, setSortOrder] = useState(String(table?.sortOrder ?? 0));
  const [error, setError] = useState('');
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        const base = { locationId, requestKey: crypto.randomUUID() };
        if (edit.kind === 'ARCHIVE') {
          void operation.send({
            family: 'TABLE',
            kind: 'ARCHIVE',
            tableId: edit.table.id,
            body: { ...base, version: edit.table.version },
          });
          return;
        }
        const values = { ...base, name, capacity: Number(capacity), sortOrder: Number(sortOrder) };
        if (edit.kind === 'CREATE') {
          const parsed = diningTableCreateSchema.safeParse({ ...values, code });
          if (!parsed.success) {
            setError(text.invalid);
            return;
          }
          void operation.send({ family: 'TABLE', kind: 'CREATE', body: parsed.data });
        } else {
          const parsed = diningTableUpdateSchema.safeParse({
            ...values,
            version: edit.table.version,
          });
          if (!parsed.success) {
            setError(text.invalid);
            return;
          }
          void operation.send({
            family: 'TABLE',
            kind: 'UPDATE',
            tableId: edit.table.id,
            body: parsed.data,
          });
        }
      }}
    >
      {edit.kind === 'ARCHIVE' ? (
        <p>
          {text.archiveHint} {table?.name}
        </p>
      ) : (
        <>
          <Field
            label={text.code}
            value={code}
            disabled={!!table || operation.locked}
            onChange={(event) => setCode(event.target.value)}
            required
            maxLength={20}
          />
          <Field
            label={text.name}
            value={name}
            disabled={operation.locked}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
          />
          <Field
            label={text.capacity}
            type="number"
            min={1}
            max={999}
            value={capacity}
            disabled={operation.locked}
            onChange={(event) => setCapacity(event.target.value)}
            required
          />
          <Field
            label={text.sortOrder}
            type="number"
            min={0}
            max={100000}
            value={sortOrder}
            disabled={operation.locked}
            onChange={(event) => setSortOrder(event.target.value)}
            required
          />
        </>
      )}
      {error && <Notice>{error}</Notice>}
      <div className="inline">
        <Button
          type="button"
          variant="secondary"
          disabled={operation.busy || operation.recovering}
          onClick={onClose}
        >
          {text.cancel}
        </Button>
        <Button type="submit" busy={operation.busy} disabled={operation.locked}>
          {edit.kind === 'ARCHIVE' ? text.confirmArchive : text.save}
        </Button>
      </div>
    </form>
  );
}
