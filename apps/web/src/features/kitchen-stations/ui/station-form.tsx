import { useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import { stationMessages as text } from '@pos/ui/locales';
import {
  kitchenStationCreateSchema,
  kitchenStationUpdateSchema,
} from '@pos/contracts/kitchen-stations';
import type { StationFormProps } from '../model/station.types';
export function StationForm({ edit, locationId, operation, onClose }: StationFormProps) {
  const station = edit.kind === 'CREATE' ? null : edit.station;
  const [code, setCode] = useState(station?.code ?? '');
  const [name, setName] = useState(station?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(station?.sortOrder ?? 0));
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
            family: 'STATION',
            kind: 'ARCHIVE',
            stationId: edit.station.id,
            body: { ...base, version: edit.station.version },
          });
          return;
        }
        const values = { ...base, name, sortOrder: Number(sortOrder) };
        if (edit.kind === 'CREATE') {
          const parsed = kitchenStationCreateSchema.safeParse({ ...values, code });
          if (!parsed.success) {
            setError(text.invalid);
            return;
          }
          void operation.send({ family: 'STATION', kind: 'CREATE', body: parsed.data });
        } else {
          const parsed = kitchenStationUpdateSchema.safeParse({
            ...values,
            version: edit.station.version,
          });
          if (!parsed.success) {
            setError(text.invalid);
            return;
          }
          void operation.send({
            family: 'STATION',
            kind: 'UPDATE',
            stationId: edit.station.id,
            body: parsed.data,
          });
        }
      }}
    >
      {edit.kind === 'ARCHIVE' ? (
        <p>
          {text.archiveHint} {station?.name}
        </p>
      ) : (
        <>
          <Field
            label={text.code}
            value={code}
            disabled={!!station || operation.locked}
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
