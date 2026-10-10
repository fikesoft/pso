import { useActiveOrders } from './use-active-orders';
import { useState } from 'react';
import type { Order, OrderRepeatSource } from '@pos/contracts';
import { operationalMessages as text } from '@pos/ui/locales';
import { useOrderCatalogSearch } from '../../../entities/catalog';
import { useOrderSearch } from './use-order-search';
import { useOrderReview } from './use-order-review';
import type { OrderEntryProps } from './order-entry.types';
export function useOrderEntry(
  { api, locationId, can, organizationId, actorUserId }: OrderEntryProps,
  operator = false,
  repeatBlocked = false,
) {
  const canRead = can('orders.read');
  const canCreate = can('orders.create');
  const search = useOrderSearch({ api, locationId, enabled: canRead && !operator });
  const active = useActiveOrders({ api, locationId, enabled: canRead && operator });
  const orders = operator ? active.orders : search.orders;
  const refreshOrders = operator ? active.refreshWindow : search.refreshWindow;
  const catalog = useOrderCatalogSearch({ api, locationId, enabled: canCreate });
  const [editing, setEditing] = useState<Order | null | undefined>(undefined);
  const [repeatSource, setRepeatSource] = useState<OrderRepeatSource | null>(null);
  const review = useOrderReview({
    api,
    locationId,
    can,
    organizationId,
    actorUserId,
    onUpdated: refreshOrders,
  });
  const { setSelected } = review;
  async function refresh() {
    await Promise.all([refreshOrders(), catalog.refresh()]);
  }
  async function saved(order: Order) {
    setEditing(undefined);
    setRepeatSource(null);
    setSelected(canRead ? order : null);
    review.setNotice(text.draftSaved);
    await refreshOrders();
  }
  async function open(order: Order) {
    if (operator && canCreate && repeatBlocked) return;
    review.open(order);
  }
  function startRepeat(source: OrderRepeatSource) {
    if (
      !canRead ||
      !canCreate ||
      repeatBlocked ||
      review.busy ||
      review.uncertainAction ||
      review.staleAction ||
      source.status === 'DRAFT'
    )
      return;
    setSelected(null);
    setRepeatSource(source);
    if (!operator) setEditing(null);
  }
  return {
    ...review,
    api,
    locationId,
    organizationId,
    actorUserId,
    repeatSource,
    startRepeat,
    repeatBlocked: canCreate && repeatBlocked,
    active,
    closeRepeat: () => setRepeatSource(null),
    canRead,
    canCreate,
    refresh,
    orders,
    search,
    catalog,
    editing,
    setEditing,
    setSelected,
    saved,
    open,
    moreProducts: catalog.more,
    moreOrders: operator ? active.more : search.more,
  };
}
