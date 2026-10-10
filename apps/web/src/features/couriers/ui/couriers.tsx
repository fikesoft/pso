import { useEffect, useState } from 'react';
import { Button, Empty, Loading, Modal, Notice, PageTitle, Select } from '@pos/ui';
import { courierMessages as text } from '@pos/ui/locales';
import type { CouriersProps, CourierEdit, CourierFilter } from '../model/courier.types';
import { useCourierList } from '../model/use-courier-list';
import { useCourierCommand } from '../model/use-courier-command';
import { CourierForm } from './courier-form';
import { CourierCard } from './courier-card';
import { CourierRecovery } from './courier-recovery';
export function Couriers(props: CouriersProps) {
  const list = useCourierList(props);
  const [edit, setEdit] = useState<CourierEdit | null>(null);
  const manage = props.canRead && props.canManage,
    enabled = manage || props.canOwn;
  const command = useCourierCommand({
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
    if (
      edit &&
      !manage &&
      !(
        props.canOwn &&
        edit.action === 'SET_AVAILABILITY' &&
        edit.courier.userId === props.actorUserId
      )
    )
      setEdit(null);
  }, [edit, manage, props.canOwn, props.actorUserId]);
  const locked = command.locked || list.loading || !!list.error;
  async function refresh() {
    if (command.busy || command.recovering) return;
    setEdit(null);
    if (await list.refresh()) command.refreshed();
  }
  if (!props.canRead && !props.canOwn) return <Notice>{text.forbidden}</Notice>;
  return (
    <section className="form-stack" aria-label={text.title}>
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        {manage && (
          <Button
            disabled={locked}
            onClick={() => setEdit({ action: 'CREATE', courierId: crypto.randomUUID() })}
          >
            {text.create}
          </Button>
        )}
      </PageTitle>
      {command.notice && <Notice tone="success">{command.notice}</Notice>}
      {!edit && command.error && <Notice>{command.error}</Notice>}
      {!edit && enabled && <CourierRecovery command={command} />}
      {!edit && command.stale && <Notice>{text.stale}</Notice>}
      <div className="inline">
        <Button
          variant="secondary"
          disabled={command.busy || command.recovering || list.loading}
          onClick={() => void refresh()}
        >
          {text.refresh}
        </Button>
        {props.canRead && (
          <Select
            label={text.filter}
            value={list.filter}
            disabled={command.busy || command.recovering || list.loading}
            onChange={(event) => {
              setEdit(null);
              list.setFilter(event.target.value as CourierFilter);
            }}
          >
            <option value="ACTIVE">{text.active}</option>
            <option value="ARCHIVED">{text.archived}</option>
            <option value="ALL">{text.all}</option>
          </Select>
        )}
      </div>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && !list.data && <Loading />}
      {!list.loading && !list.error && !list.data?.couriers.length && (
        <Empty title={text.empty} description={text.emptyHint} />
      )}
      {!list.error && (
        <div className="operation-order-list">
          {list.data?.couriers.map((courier) => (
            <CourierCard
              key={courier.id}
              courier={courier}
              canManage={manage}
              canSetAvailability={manage || (props.canOwn && courier.userId === props.actorUserId)}
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
                : edit?.action === 'RESTORE'
                  ? text.restore
                  : text.changeAvailability
        }
      >
        {edit && (
          <CourierForm
            api={props.api}
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
