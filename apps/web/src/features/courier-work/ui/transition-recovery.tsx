import { Button, Notice } from '@pos/ui';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { TransitionRecoveryProps } from '../model/courier-transition.types';
export function TransitionRecovery({ command }: TransitionRecoveryProps) {
  if (!command.recovering) return null;
  return (
    <div className="form-stack">
      <Notice>{text.transitionUncertain}</Notice>
      <div className="inline">
        {command.hasAttempt && (
          <Button variant="secondary" disabled={command.busy} onClick={() => void command.send()}>
            {text.transitionRetry}
          </Button>
        )}
        <Button variant="secondary" disabled={command.busy} onClick={() => void command.resolve()}>
          {text.transitionResolve}
        </Button>
      </div>
    </div>
  );
}
