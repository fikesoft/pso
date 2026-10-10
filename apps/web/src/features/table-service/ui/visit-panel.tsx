import { useCallback, useEffect } from 'react';
import { Badge, Button, Loading, Notice } from '@pos/ui';
import { tableMessages as text, billSplitMessages } from '@pos/ui/locales';
import { readTableVisit, useTableOperation } from '../../../entities/table';
import { useRemoteData, useInvalidation, useCoalescedInvalidation } from '../../../shared/lib';
import type { VisitPanelProps } from '../model/table-service.types';
import { VisitMerge } from './visit-merge';
import { VisitMove } from './visit-move';
import { VisitActions } from './visit-actions';
import { VisitOrders } from './visit-orders';
import { VisitHistory } from './visit-history';
import { TableRecovery } from './table-recovery';
export function VisitPanel(props: VisitPanelProps) {
  const detail = useRemoteData(
    useCallback(
      () => readTableVisit(props.api, props.id, props.locationId),
      [props.api, props.id, props.locationId],
    ),
  );
  const operation = useTableOperation({
    ...props,
    family: 'VISIT',
    isExternallyBlocked: () => props.blocked,
    onSaved: () => detail.refresh(),
  });
  const signal = useInvalidation(`orders:${props.locationId}`);
  useCoalescedInvalidation(signal, async () => {
    if (!operation.busy) await detail.refresh();
  });
  useEffect(() => {
    void detail.refresh();
  }, [props.refreshToken, detail.refresh]);
  async function refresh() {
    if (await detail.refresh()) operation.refreshed();
  }
  const blocked = props.blocked || operation.busy || operation.recovering;
  return (
    <section className="form-stack">
      <div className="inline">
        <Button variant="secondary" disabled={blocked} onClick={props.onBack}>
          {text.back}
        </Button>
        <Button
          variant="secondary"
          disabled={blocked}
          busy={detail.loading}
          onClick={() => void refresh()}
        >
          {text.refreshVisit}
        </Button>
      </div>
      <TableRecovery operation={operation} onRefresh={() => void refresh()} />
      {detail.error && <Notice>{detail.error}</Notice>}
      {detail.loading && !detail.data && <Loading />}
      {!detail.error && detail.data && (
        <>
          <h2>
            {text.visit}: {detail.data.visit.tableCode} · {detail.data.visit.tableName}
          </h2>
          <Badge>
            {detail.data.visit.status === 'MERGED'
              ? text.merged
              : detail.data.visit.status === 'CLOSED'
                ? text.closed
                : text.states[detail.data.state]}
          </Badge>
          {detail.data.visit.mergedIntoVisitId && (
            <Button
              disabled={blocked}
              onClick={() => props.onVisit(detail.data!.visit.mergedIntoVisitId!)}
            >
              {text.openMerged}
            </Button>
          )}
          {detail.data.visit.status === 'OPEN' && props.can('tables.visits.manage') && (
            <VisitMerge
              key={`merge:${props.id}:${detail.data.visit.version}`}
              {...props}
              detail={detail.data}
              operation={operation}
              blocked={props.blocked || detail.loading}
            />
          )}
          <VisitActions
            key={`actions:${props.id}:${detail.data.visit.version}`}
            {...props}
            detail={detail.data}
            operation={operation}
            blocked={props.blocked || detail.loading}
          />
          {detail.data.visit.status === 'OPEN' && props.can('tables.visits.manage') && (
            <VisitMove
              key={`move:${props.id}:${detail.data.visit.version}`}
              {...props}
              detail={detail.data}
              operation={operation}
              blocked={props.blocked || detail.loading}
            />
          )}
          {detail.data.visit.status === 'OPEN' &&
            props.can('orders.create') &&
            props.can('tables.visits.manage') && (
              <Button
                disabled={blocked || detail.loading || operation.stale}
                onClick={() =>
                  props.onCompose({ visitId: props.id, tableLabel: detail.data!.visit.tableCode })
                }
              >
                {text.newOrder}
              </Button>
            )}
          {props.can('orders.split') && (
            <Button
              disabled={blocked || detail.loading || operation.stale}
              onClick={() => props.onBill(props.id)}
            >
              {billSplitMessages.open}
            </Button>
          )}
          {props.can('orders.read') && <VisitOrders {...props} blocked={blocked} />}
          <VisitHistory
            key={`history:${props.id}:${detail.data.visit.version}`}
            {...props}
            blocked={blocked}
          />
        </>
      )}
    </section>
  );
}
