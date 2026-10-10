import type { BillContext } from '@pos/contracts/bill-splits';
import { BillService } from '../../../features/bill-service';
import { useRef, useState } from 'react';
import type { Order } from '@pos/contracts';
import { Empty, Notice } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { TableService } from '../../../features/table-service';
import { OrderComposer, OrderReview, useOrderReview } from '../../../features/order-entry';
import type { TableOrderContext } from '../../../features/order-entry';
import { useOrderCatalogSearch } from '../../../entities/catalog';
import { CashRecovery } from '../../../entities/cash-command';
import type { TableAccessProps } from '../../../entities/table';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function TableWorkspaceSection({ model }: WorkspaceComponentProps) {
  if (!model.locationId)
    return <Empty title={text.chooseLocation} description={text.chooseLocationHint} />;
  return (
    <TableWorkspace
      key={`${model.context!.organization.id}:${model.actor.id}:${model.locationId}`}
      api={model.api}
      organizationId={model.context!.organization.id}
      actorUserId={model.actor.id}
      locationId={model.locationId}
      can={model.can}
    />
  );
}
function TableWorkspace(props: TableAccessProps) {
  const [billContext, setBillContext] = useState<BillContext>();
  const [billLocked, setBillLocked] = useState(false);
  const [context, setContext] = useState<TableOrderContext>();
  const [editing, setEditing] = useState<Order | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const contextRef = useRef(context);
  contextRef.current = context;
  const review = useOrderReview({
    ...props,
    isExternallyBlocked: () => !!contextRef.current,
    onUpdated: () => setRefreshToken((value) => value + 1),
  });
  const catalog = useOrderCatalogSearch({
    api: props.api,
    locationId: props.locationId,
    enabled: props.can('orders.create'),
  });
  const financialBlocked = !!context || !!review.selected || review.isLocked();
  const blocked = financialBlocked || !!billContext || billLocked;
  async function saved(order: Order) {
    setContext(undefined);
    setEditing(null);
    review.setSelected(review.canRead ? order : null);
    setRefreshToken((value) => value + 1);
  }
  return (
    <section className="form-stack">
      {!review.selected && <CashRecovery model={review.financial} />}
      {review.openError && <Notice>{review.openError}</Notice>}
      <BillService
        {...props}
        context={billContext}
        blocked={financialBlocked}
        onClose={() => setBillContext(undefined)}
        onUpdated={() => setRefreshToken((value) => value + 1)}
        onLockedChange={setBillLocked}
      />
      <div hidden={!!billContext}>
        <TableService
          {...props}
          blocked={blocked}
          refreshToken={refreshToken}
          onBill={(id) => {
            if (!blocked) setBillContext({ kind: 'VISIT', id });
          }}
          onOrder={(id) => void review.openById(id)}
          onCompose={(value) => {
            if (!blocked) {
              setEditing(null);
              setContext(value);
            }
          }}
        />
      </div>
      {context && (
        <>
          {catalog.error && <Notice>{catalog.error}</Notice>}
          <OrderComposer
            key={editing ? `${editing.id}:${editing.version}` : context.visitId}
            {...props}
            tableContext={context}
            order={editing}
            categories={catalog.data?.categories ?? []}
            products={catalog.data?.products ?? []}
            search={catalog.search}
            hasMoreProducts={!!catalog.data?.nextCursor}
            loadingMoreProducts={catalog.loadingMore}
            onMoreProducts={catalog.more}
            onRefreshProducts={catalog.refresh}
            onClose={() => {
              setContext(undefined);
              setEditing(null);
            }}
            onSaved={saved}
            onReload={(order) => {
              if (order.status === 'DRAFT') setEditing(order);
              else void saved(order);
            }}
          />
        </>
      )}
      {review.selected && (
        <OrderReview
          model={review}
          canEdit={props.can('orders.create')}
          editing={{
            repeat: () => {},
            repeatBlocked: true,
            edit: (order) => {
              if (review.isLocked() || !order.tableVisitId) return;
              review.setSelected(null);
              setEditing(order);
              setContext({ visitId: order.tableVisitId, tableLabel: order.tableLabel ?? '' });
            },
          }}
        />
      )}
    </section>
  );
}
