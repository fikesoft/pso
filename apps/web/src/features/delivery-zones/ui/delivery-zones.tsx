import { useEffect, useState } from 'react';
import { Button, Empty, Loading, Modal, Notice, PageTitle, Select } from '@pos/ui';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
import type { DeliveryZonesProps, ZoneEdit, ZoneFilter } from '../model/delivery-zone.types';
import { useZoneList } from '../model/use-zone-list';
import { useZoneCommand } from '../model/use-zone-command';
import { ZoneForm } from './zone-form';
import { ZoneCard } from './zone-card';
import { ZoneRecovery } from './zone-recovery';
export function DeliveryZones(props: DeliveryZonesProps) {
  const list = useZoneList(props);
  const [edit, setEdit] = useState<ZoneEdit | null>(null);
  const enabled = props.canRead && props.canManage;
  const command = useZoneCommand({
    ...props,
    enabled,
    onSettled: async () => {
      setEdit(null);
      await list.refresh();
    },
    onInvalidated: () => {
      setEdit(null);
      list.invalidate();
    },
  });
  useEffect(() => {
    if (!enabled) setEdit(null);
  }, [enabled]);
  const locked = command.locked || list.loading || !!list.error;
  async function refresh() {
    if (command.busy || command.recovering) return;
    setEdit(null);
    if (await list.refresh()) command.refreshed();
  }
  if (!props.canRead) return <Notice>{text.forbidden}</Notice>;
  return (
    <section className="form-stack" aria-label={text.title}>
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        {enabled && (
          <Button
            disabled={locked}
            onClick={() => setEdit({ action: 'CREATE', zoneId: crypto.randomUUID() })}
          >
            {text.create}
          </Button>
        )}
      </PageTitle>
      <p className="section-note">
        {text.timezone}
        {props.timezone ? `: ${props.timezone}` : ''}
      </p>
      {command.notice && <Notice tone="success">{command.notice}</Notice>}
      {!edit && command.error && <Notice>{command.error}</Notice>}
      {!edit && enabled && <ZoneRecovery command={command} />}
      {!edit && command.stale && <Notice>{text.stale}</Notice>}
      <div className="inline">
        <Button
          variant="secondary"
          disabled={command.busy || command.recovering || list.loading}
          onClick={() => void refresh()}
        >
          {text.refresh}
        </Button>
        <Select
          label={text.filter}
          value={list.filter}
          disabled={command.busy || command.recovering || list.loading}
          onChange={(event) => {
            setEdit(null);
            list.setFilter(event.target.value as ZoneFilter);
          }}
        >
          <option value="ACTIVE">{text.active}</option>
          <option value="ARCHIVED">{text.archived}</option>
          <option value="ALL">{text.all}</option>
        </Select>
      </div>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && !list.data && <Loading />}
      {!list.loading && !list.error && !list.data?.zones.length && (
        <Empty title={text.empty} description={text.emptyHint} />
      )}
      {!list.error && (
        <div className="operation-order-list">
          {list.data?.zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              canManage={enabled}
              locked={locked}
              onEdit={setEdit}
            />
          ))}
        </div>
      )}
      {list.data?.nextCursor && !list.error && (
        <Button
          variant="secondary"
          busy={list.loading}
          disabled={command.busy || command.recovering}
          onClick={() => void list.more()}
        >
          {text.more}
        </Button>
      )}
      <Modal
        open={!!edit}
        onOpenChange={(open) => {
          if (!open && !command.busy) setEdit(null);
        }}
        title={
          edit?.action === 'CREATE'
            ? text.create
            : edit?.action === 'UPDATE'
              ? text.edit
              : edit?.action === 'ARCHIVE'
                ? text.archive
                : text.restore
        }
      >
        {edit && (
          <ZoneForm
            edit={edit}
            locationId={props.locationId}
            command={command}
            onClose={() => setEdit(null)}
          />
        )}
      </Modal>
    </section>
  );
}
