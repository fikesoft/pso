import { useCourierApp } from '../model/use-courier-app';
import { CourierAppStatus } from './courier-app-status';
import { useState } from 'react';
import { Button, Empty, Loading, Modal, Notice, PageTitle, Select } from '@pos/ui';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { CourierWorkProps, CourierWorkView } from '../model/courier-work.types';
import { useCourierWorkList } from '../model/use-courier-work-list';
import { CourierWorkCard } from './courier-work-card';
import { CourierWorkDetails } from './courier-work-details';
import { useAcceptance } from '../model/use-acceptance';
import { AcceptanceRecovery } from './acceptance-recovery';
import { TransitionRecovery } from './transition-recovery';
import { useTransition } from '../model/use-transition';
export function CourierWork(props: CourierWorkProps) {
  const app = useCourierApp();
  const list = useCourierWorkList(props),
    [selected, setSelected] = useState<string | null>(null);
  const mutationInput = {
    ...props,
    enabled: props.canRead && app.online,
    onSettled: async () => {
      setSelected(null);
      await list.refresh();
    },
    onInvalidated: () => {
      setSelected(null);
      list.invalidate();
    },
  };
  const command = useAcceptance(mutationInput),
    transition = useTransition(mutationInput);
  const pending = command.busy || command.recovering || transition.busy || transition.recovering;
  if (!props.canRead) return <Notice>{text.forbidden}</Notice>;
  return (
    <section className="form-stack" aria-label={text.title}>
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description} />
      <p>{text.onlineHint}</p>
      <CourierAppStatus {...app} />
      {command.notice && <Notice tone="success">{command.notice}</Notice>}
      {!selected && command.error && <Notice>{command.error}</Notice>}
      {!selected && <AcceptanceRecovery command={command} />}
      {!selected && command.stale && <Notice>{text.stale}</Notice>}
      {transition.notice && <Notice tone="success">{transition.notice}</Notice>}
      {!selected && transition.error && <Notice>{transition.error}</Notice>}
      {!selected && <TransitionRecovery command={transition} />}
      {!selected && transition.stale && <Notice>{text.stale}</Notice>}
      <div className="inline">
        <Select
          label={text.view}
          value={list.view}
          disabled={list.loading || pending}
          onChange={(event) => {
            setSelected(null);
            list.setView(event.target.value as CourierWorkView);
          }}
        >
          <option value="ACTIVE">{text.active}</option>
          <option value="HISTORY">{text.history}</option>
        </Select>
        <Button
          variant="secondary"
          busy={list.loading}
          disabled={pending}
          onClick={() => {
            setSelected(null);
            command.refreshed();
            transition.refreshed();
            void list.refresh();
          }}
        >
          {text.refresh}
        </Button>
      </div>
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && !list.data && <Loading />}
      {!list.loading && !list.error && !list.data?.orders.length && (
        <Empty title={text.empty} description={text.emptyHint} />
      )}
      {!list.error && (
        <div className="operation-order-list">
          {list.data?.orders.map((order) => (
            <CourierWorkCard
              key={order.orderId}
              order={order}
              onOpen={() => setSelected(order.orderId)}
            />
          ))}
        </div>
      )}
      {!list.error && list.data?.nextCursor && (
        <Button busy={list.loading} variant="secondary" onClick={() => void list.more()}>
          {text.more}
        </Button>
      )}
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !command.busy && !transition.busy) setSelected(null);
        }}
        title={text.details}
      >
        {selected && (
          <CourierWorkDetails
            key={selected}
            {...props}
            orderId={selected}
            command={{ ...command, locked: command.locked || transition.locked }}
            transition={{ ...transition, locked: transition.locked || command.locked }}
            onInvalidated={list.invalidate}
          />
        )}
      </Modal>
    </section>
  );
}
