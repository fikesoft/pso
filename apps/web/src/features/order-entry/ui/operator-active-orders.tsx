import { Button, Empty, Loading, Notice } from '@pos/ui';
import { activeOrderMessages as text, orderSearchMessages } from '@pos/ui/locales';
import type { OperatorActiveOrdersProps } from '../model/active-orders.types';
import { ActiveOrderCard } from './active-order-card';
import { operatorModes } from '../config/operator-mode.constants';
export function OperatorActiveOrders({ model, mode = 'operator' }: OperatorActiveOrdersProps) {
  const presentation = operatorModes[mode];
  const { orders, liveBusy, refreshWindow, more } = model.active;
  const disabled =
    model.repeatBlocked ||
    model.busy ||
    !!model.uncertainAction ||
    model.staleAction ||
    !!model.selected ||
    model.editing !== undefined ||
    !!orders.error ||
    orders.loading;
  return (
    <section
      id={presentation.activeOrdersId}
      tabIndex={-1}
      className="operator-active-orders form-stack"
      aria-label={text.title}
    >
      <div className="operation-card-heading">
        <h2>{text.title}</h2>
        <Button
          variant="secondary"
          busy={orders.loading || liveBusy || orders.loadingMore}
          onClick={() => void refreshWindow()}
        >
          {text.refresh}
        </Button>
      </div>
      {model.canCreate && <a href={`#${presentation.composerId}`}>{text.back}</a>}
      <p className="scope-hint">{text.description}</p>
      {orders.data?.timezone && (
        <p className="scope-hint">
          {orderSearchMessages.timezone}: {orders.data.timezone}.
        </p>
      )}
      {model.repeatBlocked && <Notice tone="info">{text.locked}</Notice>}
      {orders.error && <Notice>{orders.error}</Notice>}
      {orders.loading && !orders.data ? (
        <Loading />
      ) : (
        orders.data &&
        !orders.data.orders.length && (
          <Empty
            title={orders.data.nextCursor ? text.continuation : text.empty}
            description={orders.data.nextCursor ? text.description : text.emptyHint}
          />
        )
      )}
      <div className="operation-order-list">
        {orders.data?.orders.map((order) => (
          <ActiveOrderCard
            key={order.id}
            order={order}
            mode={mode}
            timezone={orders.data!.timezone}
            disabled={disabled}
            onOpen={() => {
              if (!disabled) void model.open(order);
            }}
          />
        ))}
      </div>
      {orders.data?.nextCursor && (
        <Button
          variant="secondary"
          busy={orders.loadingMore}
          disabled={orders.loading || liveBusy}
          onClick={() => void more()}
        >
          {text.more}
        </Button>
      )}
    </section>
  );
}
