import { useEffect, useLayoutEffect, useRef } from 'react';
import { Notice } from '@pos/ui';
import { CashRecovery } from '../../../entities/cash-command';
import { OrderReview, useOrderReview } from '../../../features/order-entry';
import {
  ResponsibilityPanel,
  ResponsibilityQueue,
  ResponsibilityStatus,
  useResponsibilityWorkspace,
} from '../../../features/order-responsibility-management';
import type { ResponsibilityWorkspaceProps } from '../model/responsibility-workspace.types';
export function OrderResponsibilityWorkspace(props: ResponsibilityWorkspaceProps) {
  const guard = useRef<() => boolean>(() => false);
  const refresh = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const review = useOrderReview({
    ...props,
    isExternallyBlocked: () => guard.current(),
    onUpdated: () => refresh.current(),
  });
  const responsibility = useResponsibilityWorkspace({
    ...props,
    orderId: review.selected?.id,
    orderVersion: review.selected?.version,
    accessBlocked: review.selection.blocked,
    isReviewLocked: review.isLocked,
    onSaved: review.selection.refresh,
  });
  guard.current = responsibility.isBlocking;
  useLayoutEffect(() => {
    props.registerGuard(() => guard.current());
    return () => props.registerGuard(null);
  }, [props.registerGuard]);
  const blocking =
    responsibility.command.blocked || responsibility.command.busy || !!responsibility.form;
  useEffect(() => {
    props.onBlockingChange(blocking);
  }, [props.onBlockingChange, blocking]);
  refresh.current = () => responsibility.list.refresh();
  const status = (
    <ResponsibilityStatus
      command={responsibility.command}
      onRefresh={responsibility.detail.refresh}
    />
  );
  return (
    <section id={`order-responsibilities-${props.locationId}`} className="form-stack">
      {!review.selected && (
        <>
          <CashRecovery model={review.financial} />
          {status}
        </>
      )}
      {review.openError && <Notice>{review.openError}</Notice>}
      <ResponsibilityQueue
        model={responsibility}
        disabled={review.opening || !!review.selected || review.financial.blocked}
        onOpen={(id) => void review.openById(id)}
      />
      {review.selected && (
        <OrderReview
          key={review.selected.id}
          model={review}
          canEdit={review.canCreate}
          recoveryExtension={status}
          renderExtension={({ blocked }) => (
            <ResponsibilityPanel model={responsibility} blocked={blocked} />
          )}
        />
      )}
    </section>
  );
}
