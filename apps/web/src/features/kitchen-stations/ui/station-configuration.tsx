import { useCallback, useState } from 'react';
import { Button, Loading, Modal, Notice, Select } from '@pos/ui';
import { stationMessages as text } from '@pos/ui/locales';
import { readKitchenStations, useStationOperation } from '../../../entities/kitchen-station';
import { useRemoteData } from '../../../shared/lib';
import type { StationConfigurationProps, StationEdit } from '../model/station.types';
import { StationForm } from './station-form';
import { StationRecovery } from './station-recovery';
export function StationConfiguration(props: StationConfigurationProps) {
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [cursor, setCursor] = useState<string>();
  const [edit, setEdit] = useState<StationEdit | null>(null);
  const list = useRemoteData(
    useCallback(
      () =>
        readKitchenStations(props.api, { locationId: props.locationId, status, limit: 50, cursor }),
      [props.api, props.locationId, status, cursor],
    ),
  );
  const operation = useStationOperation({
    ...props,
    family: 'STATION',
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
    <section className="form-stack" aria-label={text.configuration}>
      <Button
        variant="secondary"
        disabled={operation.busy || operation.recovering || !!edit}
        onClick={props.onBack}
      >
        {text.back}
      </Button>
      <h2>{text.configuration}</h2>
      {!edit && <StationRecovery operation={operation} onRefresh={() => void refresh()} />}
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
        list.data?.stations.map((station) => (
          <article key={station.id} className="operation-order-card">
            <h3>
              {station.code} · {station.name}
            </h3>
            {station.status === 'ACTIVE' && (
              <div className="inline">
                <Button
                  variant="secondary"
                  disabled={blocked}
                  onClick={() => setEdit({ kind: 'UPDATE', station })}
                >
                  {text.edit}
                </Button>
                <Button
                  variant="secondary"
                  disabled={blocked}
                  onClick={() => setEdit({ kind: 'ARCHIVE', station })}
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
        <StationRecovery operation={operation} onRefresh={() => void refresh()} />
        {edit && (
          <StationForm
            key={
              edit.kind === 'CREATE'
                ? 'new'
                : `${edit.kind}:${edit.station.id}:${edit.station.version}`
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
