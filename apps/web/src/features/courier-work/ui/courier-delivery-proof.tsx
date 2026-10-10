import { useState } from 'react';
import { deliveryProofSchema } from '@pos/contracts/delivery';
import type { DeliveryProof } from '@pos/contracts/delivery';
import { Button, Field, Notice } from '@pos/ui';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { CourierDeliveryActionsProps } from '../model/courier-transition.types';
import { SignaturePad } from './signature-pad';
export function CourierDeliveryProof({ order, command }: CourierDeliveryActionsProps) {
  const [recipientName, setRecipientName] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const [signature, setSignature] = useState<DeliveryProof['signature']>([]);
  const proof = deliveryProofSchema.safeParse({ recipientName, confirmed, signature });
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (command.locked || !proof.success) return;
        void command.send({
          orderId: order.orderId,
          locationId: order.locationId,
          body: {
            version: order.orderVersion,
            requestKey: crypto.randomUUID(),
            status: 'DELIVERED',
            proof: proof.data,
          },
        });
      }}
    >
      <Notice>{text.proofHint}</Notice>
      <Field
        label={text.recipientName}
        value={recipientName}
        onChange={(event) => setRecipientName(event.target.value)}
        minLength={2}
        maxLength={120}
        required
        disabled={command.locked}
        autoComplete="off"
      />
      <SignaturePad value={signature} onChange={setSignature} disabled={command.locked} />
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={command.locked}
        />{' '}
        {text.proofConfirmation}
      </label>
      <Button type="submit" disabled={command.locked || !proof.success} busy={command.busy}>
        {text.deliver}
      </Button>
    </form>
  );
}
