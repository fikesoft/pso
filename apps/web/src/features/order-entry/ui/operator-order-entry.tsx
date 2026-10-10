import { CashRecovery } from '../../../entities/cash-command';
import { OperatorActiveOrders } from './operator-active-orders';
import { useState } from 'react';
import { Button, Loading, Notice, PageTitle } from '@pos/ui';
import { operationalMessages, activeOrderMessages } from '@pos/ui/locales';
import type { Order } from '@pos/contracts';
import type { OrderEditorProps } from '../model/order-entry.types';
import type { OperatorOrderEntryProps } from '../model/operator.types';
import { operatorModes } from '../config/operator-mode.constants';
import { useOrderEntry } from '../model/use-order-entry';
import { OperatorComposer } from './operator-composer';
import { OrderDetails } from './order-details';
import { OrderEditor } from './order-editor';
export function OperatorOrderEntry(props: OperatorOrderEntryProps) {
  const mode = props.mode ?? 'operator';
  const text = operatorModes[mode];
  const [repeatBlocked, setRepeatBlocked] = useState(true);
  const model = useOrderEntry(props, true, repeatBlocked);
  const [epoch, setEpoch] = useState(0);
  async function saved(order: Order) {
    setEpoch((value) => value + 1);
    await model.saved(order);
  }
  const editor: OrderEditorProps = {
    ...props,
    order: null,
    canReadOrders: model.canRead,
    repeatSource: model.repeatSource,
    onRepeatSource: model.startRepeat,
    onCloseRepeat: model.closeRepeat,
    onRepeatGuard: setRepeatBlocked,
    search: model.catalog.search,
    categories: model.catalog.data?.categories,
    products: model.catalog.data?.products ?? [],
    hasMoreProducts: !!model.catalog.data?.nextCursor,
    loadingMoreProducts: model.catalog.loadingMore,
    onMoreProducts: model.moreProducts,
    onRefreshProducts: model.catalog.refresh,
    onClose: () => setEpoch((value) => value + 1),
    onSaved: saved,
    onReload: model.setSelected,
  };
  return (
    <section className="operator-workspace">
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        {model.canCreate && (
          <Button
            variant="secondary"
            busy={model.catalog.loading}
            onClick={() => void model.catalog.refresh()}
          >
            {operationalMessages.refresh} · {operationalMessages.catalog}
          </Button>
        )}
        {model.canRead && model.canCreate && (
          <a href={`#${text.activeOrdersId}`}>{activeOrderMessages.jump}</a>
        )}
      </PageTitle>
      {!model.selected && <CashRecovery model={model.financial} />}
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {model.catalog.error && <Notice>{model.catalog.error}</Notice>}
      {model.catalog.loading && !model.catalog.data && <Loading />}
      {model.canCreate && (
        <OperatorComposer
          key={`${props.organizationId}:${props.actorUserId}:${props.locationId}:${epoch}`}
          {...editor}
          mode={mode}
          categories={model.catalog.data?.categories ?? []}
        />
      )}
      {model.canRead && <OperatorActiveOrders model={model} mode={mode} />}
      {model.editing && (
        <OrderEditor
          key={`${model.editing.id}:${model.editing.version}`}
          {...editor}
          order={model.editing}
          onRepeatGuard={undefined}
          onClose={() => model.setEditing(undefined)}
          onSaved={model.saved}
          onReload={(order) => {
            if (order.status === 'DRAFT') model.setEditing(order);
            else {
              model.setEditing(undefined);
              model.setSelected(order);
            }
          }}
        />
      )}
      {model.selected && model.canRead && (
        <OrderDetails
          key={model.selected.id}
          model={model}
          canEdit={model.canCreate}
          editing={{
            edit: model.setEditing,
            repeat: model.startRepeat,
            repeatBlocked: model.repeatBlocked,
          }}
        />
      )}
    </section>
  );
}
