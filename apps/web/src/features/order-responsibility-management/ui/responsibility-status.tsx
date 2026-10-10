import { Button, Notice } from '@pos/ui';
import {
  cashRecoveryMessages as text,
  orderResponsibilityMessages as responsibility,
} from '@pos/ui/locales';
import type { ResponsibilityCommandModel } from '../model/responsibility-management.types';
export function ResponsibilityStatus({
  command,
  onRefresh,
}: {
  command: ResponsibilityCommandModel;
  onRefresh?: () => Promise<unknown>;
}) {
  return (
    <>
      {command.error && <Notice>{command.error}</Notice>}
      {command.notice && <Notice tone="success">{command.notice}</Notice>}
      {command.pointer && (
        <Notice>
          <p>{text.recovery}</p>
          <Button
            variant="secondary"
            busy={command.busy}
            disabled={command.busy || !command.canResolve}
            onClick={() => void command.resolve()}
          >
            {text.resolve}
          </Button>
          {command.uncertain && command.hasAttempt && (
            <Button
              variant="secondary"
              disabled={command.busy || !command.canRetry}
              onClick={() => void command.send()}
            >
              {text.retry}
            </Button>
          )}
        </Notice>
      )}
      {command.stale && (
        <Notice>
          <p>{responsibility.stale}</p>
          {onRefresh && (
            <Button
              variant="secondary"
              onClick={() => {
                command.reset();
                void onRefresh();
              }}
            >
              {responsibility.refresh}
            </Button>
          )}
        </Notice>
      )}
    </>
  );
}
