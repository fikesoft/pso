import { Button, Notice } from '@pos/ui';
import { cashRegisterMessages as text } from '@pos/ui/locales';
import type { RegisterRecoveryProps } from '../model/register-ui.types';
export function RegisterRecovery({ command, enabled }: RegisterRecoveryProps) {
  if (!command.recovering) return null;
  return (
    <Notice tone="info">
      <p>{text.recovery}</p>
      <div className="inline">
        {command.hasAttempt && (
          <Button
            type="button"
            variant="secondary"
            busy={command.busy}
            disabled={!enabled}
            onClick={() => void command.send()}
          >
            {text.retry}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          busy={command.busy}
          disabled={!enabled}
          onClick={() => void command.resolve()}
        >
          {text.resolve}
        </Button>
      </div>
    </Notice>
  );
}
