import { useState } from 'react';
import { CourierDeliveryProof } from './courier-delivery-proof';
import { Button, Field, Notice } from '@pos/ui';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { CourierDeliveryActionsProps } from '../model/courier-transition.types';
export function CourierDeliveryActions({ order, command }: CourierDeliveryActionsProps) {
  const [reason, setReason] = useState(''),
    [failing, setFailing] = useState(false);
  const active = ['ASSIGNED', 'PICKED_UP', 'DELIVERING'].includes(order.deliveryStatus);
  if (!active) return null;
  const send = (status: 'PICKED_UP' | 'DELIVERING' | 'FAILED') =>
    command.send({
      orderId: order.orderId,
      locationId: order.locationId,
      body: {
        version: order.orderVersion,
        requestKey: crypto.randomUUID(),
        status,
        ...(status === 'FAILED' ? { reason: reason.trim() } : {}),
      },
    });
  return (
    <div className="form-stack">
      {order.deliveryStatus === 'ASSIGNED' && order.acceptedAt && (
        <>
          {(order.kitchenStatus !== 'READY' ||
            !['READY', 'NOT_REQUIRED'].includes(order.packingStatus)) && (
            <Notice>{text.pickupNotReady}</Notice>
          )}
          <Button
            disabled={
              command.locked ||
              order.kitchenStatus !== 'READY' ||
              !['READY', 'NOT_REQUIRED'].includes(order.packingStatus)
            }
            busy={command.busy}
            onClick={() => void send('PICKED_UP')}
          >
            {text.pickup}
          </Button>
        </>
      )}
      {order.deliveryStatus === 'PICKED_UP' && (
        <Button
          disabled={command.locked}
          busy={command.busy}
          onClick={() => void send('DELIVERING')}
        >
          {text.startRoute}
        </Button>
      )}
      {order.deliveryStatus === 'DELIVERING' && (
        <CourierDeliveryProof order={order} command={command} />
      )}
      <Button variant="secondary" disabled={command.locked} onClick={() => setFailing(!failing)}>
        {text.fail}
      </Button>
      {failing && (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!command.locked && reason.trim().length >= 3) void send('FAILED');
          }}
        >
          <Field
            label={text.failureReason}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={500}
            required
            disabled={command.locked}
          />
          <Button
            type="submit"
            disabled={command.locked || reason.trim().length < 3}
            busy={command.busy}
          >
            {text.confirmFailure}
          </Button>
        </form>
      )}
    </div>
  );
}
