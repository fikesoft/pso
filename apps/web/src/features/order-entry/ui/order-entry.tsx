import { CashRecovery } from '../../../entities/cash-command';
import { OrderSearch } from './order-search';
import { orderSearchMessages } from '@pos/ui/locales';
import { Button, Empty, Loading, Notice, PageTitle, Plus, RefreshCw } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { useOrderEntry } from '../model/use-order-entry';
import type { OrderEntryProps } from '../model/order-entry.types';
import { OrderList } from './order-list';
import { OrderEditor } from './order-editor';
import { OrderDetails } from './order-details';
export function OrderEntry(props: OrderEntryProps) {
  const model = useOrderEntry(props);
  return (
    <section>
      <PageTitle
        title={text.orders}
        eyebrow={props.locationName}
        description={text.ordersDescription}
      >
        <Button
          variant="secondary"
          busy={model.orders.loading || model.catalog.loading}
          onClick={() => void model.refresh()}
        >
          <RefreshCw size={16} />
          {text.refresh}
        </Button>
        {model.canCreate && (
          <Button
            onClick={() => model.setEditing(null)}
            disabled={model.catalog.loading || !!model.catalog.error}
          >
            <Plus size={16} />
            {text.newOrder}
          </Button>
        )}
      </PageTitle>
      {model.canRead && <OrderSearch model={model.search} />}
      {model.orders.data?.timezone && (
        <p className="scope-hint">
          {orderSearchMessages.timezone}: {model.orders.data.timezone}.
        </p>
      )}
      {model.orders.error && <Notice>{model.orders.error}</Notice>}
      {model.catalog.error && <Notice>{model.catalog.error}</Notice>}
      {!model.selected && <CashRecovery model={model.financial} />}
      {model.notice && <Notice tone="success">{model.notice}</Notice>}
      {model.orders.loading ? (
        <Loading />
      ) : !model.orders.data?.orders.length ? (
        <Empty
          title={
            model.search.filtered || model.orders.data?.nextCursor
              ? orderSearchMessages.noMatches
              : text.noOrders
          }
          description={
            model.orders.data?.nextCursor ? orderSearchMessages.continuation : text.noOrdersHint
          }
        />
      ) : (
        <OrderList
          orders={model.orders.data.orders}
          timezone={model.orders.data.timezone}
          canEdit={model.canCreate}
          busy={model.busy}
          onOpen={(order) => void model.open(order)}
          onEdit={model.setEditing}
        />
      )}
      {model.orders.data?.nextCursor && (
        <Button
          variant="secondary"
          busy={model.orders.loadingMore}
          disabled={model.search.liveBusy}
          onClick={() => void model.moreOrders()}
        >
          {text.more}
        </Button>
      )}
      {model.catalog.data?.nextCursor && model.canCreate && (
        <Button
          variant="secondary"
          busy={model.catalog.loadingMore}
          onClick={() => void model.moreProducts()}
        >
          {text.more} · {text.catalog}
        </Button>
      )}
      {model.editing !== undefined && (
        <OrderEditor
          key={`${props.organizationId}:${props.actorUserId}:${props.locationId}:${model.editing ? `${model.editing.id}:${model.editing.version}` : 'new'}`}
          canReadCustomers={props.canReadCustomers}
          canCreateCustomers={props.canCreateCustomers}
          canManageAddresses={props.canManageAddresses}
          repeatSource={model.repeatSource}
          onRepeatSource={model.startRepeat}
          onCloseRepeat={model.closeRepeat}
          canReadOrders={model.canRead}
          api={props.api}
          organizationId={props.organizationId}
          actorUserId={props.actorUserId}
          locationId={props.locationId}
          order={model.editing}
          categories={model.catalog.data?.categories}
          search={model.catalog.search}
          products={model.catalog.data?.products ?? []}
          hasMoreProducts={!!model.catalog.data?.nextCursor}
          loadingMoreProducts={model.catalog.loadingMore}
          onMoreProducts={model.moreProducts}
          onRefreshProducts={model.catalog.refresh}
          onClose={() => {
            model.closeRepeat();
            model.setEditing(undefined);
          }}
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
      {model.selected && (
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
