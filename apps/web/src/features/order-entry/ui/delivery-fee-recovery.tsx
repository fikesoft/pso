import { Button, Notice } from '@pos/ui';
import { orderDeliveryFeeMessages as text } from '@pos/ui/locales';
import type { DeliveryFeeProps } from '../model/delivery-fee.types';
export function DeliveryFeeRecovery({ model, disabled }: DeliveryFeeProps) {
  const command = model.command;
  return (
    <>
      {command.error && <Notice>{command.error}</Notice>}
      {command.notice && <Notice tone="info">{command.notice}</Notice>}
      {command.recovering && (
        <>
          <Notice tone="info">{text.unknown}</Notice>
          <div className="form-footer">
            <Button disabled={disabled || command.busy} onClick={() => void command.resolve()}>
              {text.resolve}
            </Button>
            {command.hasAttempt && (
              <Button disabled={disabled || command.busy} onClick={() => void command.send()}>
                {text.retry}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
