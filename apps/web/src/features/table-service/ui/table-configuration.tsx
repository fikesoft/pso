import { useCallback, useState } from 'react';
import { Button, Loading, Modal, Notice, Select } from '@pos/ui';
import { tableMessages as text } from '@pos/ui/locales';
import { readDiningTables, useTableOperation } from '../../../entities/table';
import { useRemoteData } from '../../../shared/lib';
import type { TableConfigurationProps, TableEdit } from '../model/table-service.types';
import { TableForm } from './table-form';
import { TableRecovery } from './table-recovery';
export function TableConfiguration(props: TableConfigurationProps) {
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [cursor, setCursor] = useState<string>();
  const [edit, setEdit] = useState<TableEdit | null>(null);
  const list = useRemoteData(
    useCallback(
      () =>
        readDiningTables(props.api, { locationId: props.locationId, status, limit: 50, cursor }),
      [props.api, props.locationId, status, cursor],
    ),
  );
  const operation = useTableOperation({
    ...props,
    family: 'TABLE',
    onSaved: async () => {
      setEdit(null);
      await list.refresh();
    },
  });
  const blocked = operation.locked || list.loading || !!list.error;
  async function refresh() {
    if (await list.refresh()) {
      setEdit(null);
      operation.refreshed();
    }
  }
  return (
    <section className="form-stack">
      <Button
        variant="secondary"
        disabled={operation.busy || operation.recovering || !!edit}
        onClick={props.onBack}
      >
        {text.back}
      </Button>
      <h2>{text.configuration}</h2>
      {!edit && <TableRecovery operation={operation} onRefresh={() => void refresh()} />}
      <div className="inline">
        <Select
          label={text.status}
          value={status}
          disabled={operation.busy || operation.recovering || !!edit}
          onChange={(event) => {
            setCursor(undefined);
            setStatus(event.target.value as 'ACTIVE' | 'ARCHIVED');
          }}
        >
          <option value="ACTIVE">{text.active}</option>
          <option value="ARCHIVED">{text.archived}</option>
        </Select>
        <Button disabled={blocked} onClick={() => setEdit({ kind: 'CREATE' })}>
          {text.create}
        </Button>
      </div>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && <Loading />}
      {!list.error &&
        list.data?.tables.map((table) => (
          <article key={table.id} className="operation-order-card">
            <h3>
              {table.code} · {table.name}
            </h3>
            <p>
              {text.capacity}: {table.capacity}
            </p>
            {table.status === 'ACTIVE' && (
              <div className="inline">
                <Button
                  variant="secondary"
                  disabled={blocked}
                  onClick={() => setEdit({ kind: 'UPDATE', table })}
                >
                  {text.edit}
                </Button>
                <Button
                  variant="secondary"
                  disabled={blocked}
                  onClick={() => setEdit({ kind: 'ARCHIVE', table })}
                >
                  {text.archive}
                </Button>
              </div>
            )}
          </article>
        ))}
      <div className="inline">
        <Button
          variant="secondary"
          disabled={operation.busy || operation.recovering}
          onClick={() => {
            setCursor(undefined);
            void list.refresh();
          }}
        >
          {text.refresh}
        </Button>
        {list.data?.nextCursor && (
          <Button disabled={blocked} onClick={() => setCursor(list.data!.nextCursor!)}>
            {text.more}
          </Button>
        )}
      </div>
      <Modal
        open={!!edit}
        title={
          edit?.kind === 'CREATE'
            ? text.create
            : edit?.kind === 'ARCHIVE'
              ? text.archive
              : text.edit
        }
        onOpenChange={(open) => {
          if (!open && !operation.busy && !operation.recovering) setEdit(null);
        }}
      >
        <TableRecovery operation={operation} onRefresh={() => void refresh()} />
        {edit && (
          <TableForm
            key={
              edit.kind === 'CREATE' ? 'new' : `${edit.kind}:${edit.table.id}:${edit.table.version}`
            }
            edit={edit}
            locationId={props.locationId}
            operation={operation}
            onClose={() => setEdit(null)}
          />
        )}
      </Modal>
    </section>
  );
}
