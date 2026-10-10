import { useEffect, useRef, useState } from 'react';
import type { CourierWorkItem } from '@pos/contracts';
import { Badge, Button, Loading, Notice } from '@pos/ui';
import { errorMessage } from '@pos/ui/api';
import { courierWorkMessages as text } from '@pos/ui/locales';
import { readCourierWorkItem } from '../../../entities/courier-work';
import type { CourierWorkDetailsProps } from '../model/courier-work.types';
import { AcceptanceRecovery } from './acceptance-recovery';
import { TransitionRecovery } from './transition-recovery';
import { CourierDeliveryActions } from './courier-delivery-actions';
export function CourierWorkDetails({
  api,
  actorUserId,
  locationId,
  orderId,
  onInvalidated,
  command,
  transition,
}: CourierWorkDetailsProps) {
  const [order, setOrder] = useState<CourierWorkItem | null>(null),
    [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const invalidate = useRef(onInvalidated);
  invalidate.current = onInvalidated;
  useEffect(() => {
    let cancelled = false;
    setOrder(null);
    setError('');
    void readCourierWorkItem(api, actorUserId, locationId, orderId)
      .then((value) => {
        if (!cancelled) setOrder(value);
      })
      .catch((failure) => {
        if (!cancelled) {
          setError(errorMessage(failure));
          invalidate.current();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, actorUserId, locationId, orderId, revision]);
  return (
    <div className="form-stack">
      {error && <Notice>{error}</Notice>}
      {command.error && <Notice>{command.error}</Notice>}
      <AcceptanceRecovery command={command} />
      {transition.error && <Notice>{transition.error}</Notice>}
      <TransitionRecovery command={transition} />
      {command.stale && <Notice>{text.stale}</Notice>}
      {transition.stale && <Notice>{text.stale}</Notice>}
      {!order && !error && <Loading />}
      {order && (
        <>
          <h3>
            {text.order} #{order.number}
          </h3>
          <Badge>{text.statuses[order.deliveryStatus]}</Badge>
          {order.acceptedAt && <Badge>{text.accepted}</Badge>}
          {order.deliveryProof && (
            <Notice>
              {text.proofSaved}: {order.deliveryProof.recipientName} ·{' '}
              {new Date(order.deliveryProof.confirmedAt).toLocaleString('ro-RO')}
            </Notice>
          )}
          {order.deliveryStatus === 'ASSIGNED' && !order.acceptedAt && (
            <Button
              disabled={command.locked}
              busy={command.busy}
              onClick={() =>
                void command.send({
                  orderId: order.orderId,
                  body: {
                    locationId,
                    assignmentId: order.assignmentId,
                    requestKey: crypto.randomUUID(),
                    orderVersion: order.orderVersion,
                    confirmed: true,
                  },
                })
              }
            >
              {text.accept}
            </Button>
          )}
          <CourierDeliveryActions key={order.orderId} order={order} command={transition} />
          <p>
            <strong>{text.customer}: </strong>
            {order.customer?.name ?? text.noCustomer}
          </p>
          {order.customer?.phone && (
            <p>
              <strong>{text.phone}: </strong>
              {order.customer.phone}
            </p>
          )}
          <p>
            <strong>{text.address}: </strong>
            {order.deliveryAddress?.address ?? text.noAddress}
          </p>
          {order.deliveryAddress?.instructions && (
            <p>
              <strong>{text.instructions}: </strong>
              {order.deliveryAddress.instructions}
            </p>
          )}
          {order.notes && (
            <p>
              <strong>{text.notes}: </strong>
              {order.notes}
            </p>
          )}
          <strong>
            {text.outstanding}: {order.outstandingAmount} {order.currency}
          </strong>
          <p>
            {text.total}: {order.total} {order.currency}
          </p>
        </>
      )}
      <Button
        variant="secondary"
        disabled={command.busy || command.recovering || transition.busy || transition.recovering}
        onClick={() => {
          command.refreshed();
          transition.refreshed();
          setRevision((value) => value + 1);
        }}
      >
        {text.refresh}
      </Button>
    </div>
  );
}
