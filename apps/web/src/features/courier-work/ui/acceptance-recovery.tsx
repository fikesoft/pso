import { Button, Notice } from '@pos/ui';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { AcceptanceRecoveryProps } from '../model/courier-acceptance.types';
export function AcceptanceRecovery({ command }: AcceptanceRecoveryProps) {
  if (!command.recovering) return null;
  return (
    <div className="form-stack">
      <Notice>{text.uncertain}</Notice>
      <div className="inline">
        {command.hasAttempt && (
          <Button variant="secondary" disabled={command.busy} onClick={() => void command.send()}>
            {text.retry}
          </Button>
        )}
        <Button variant="secondary" disabled={command.busy} onClick={() => void command.resolve()}>
          {text.resolve}
        </Button>
      </div>
    </div>
  );
}
