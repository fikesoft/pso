import { Button, Notice } from '@pos/ui';
import { courierMessages as text } from '@pos/ui/locales';
import type { CourierRecoveryProps } from '../model/courier.types';
export function CourierRecovery({ command }: CourierRecoveryProps) {
  if (!command.recovering) return null;
  return (
    <div className="form-stack">
      <Notice>{text.uncertain}</Notice>
      <div className="inline">
        {command.hasAttempt && (
          <Button type="button" disabled={command.busy} onClick={() => void command.send()}>
            {text.retry}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={command.busy}
          onClick={() => void command.resolve()}
        >
          {text.resolve}
        </Button>
      </div>
    </div>
  );
}
