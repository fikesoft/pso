import { Button, Notice } from '@pos/ui';
import { cashRecoveryMessages, cashShiftMessages as text } from '@pos/ui/locales';
import { CashRecovery } from '../../../entities/cash-command';
import type { ShiftCommandStatusProps } from '../model/shift-management.types';
export function ShiftCommandStatus({ command, onRefresh }: ShiftCommandStatusProps) {
  return (
    <>
      <CashRecovery model={command.recovery} />
      {command.error && <Notice>{command.error}</Notice>}
      {command.stale && (
        <Notice>
          <p>{text.stale}</p>
          <Button type="button" variant="secondary" onClick={() => void onRefresh()}>
            {text.refresh}
          </Button>
        </Notice>
      )}
      {command.recovery.uncertain && command.hasAttempt && (
        <Button
          type="button"
          variant="secondary"
          busy={command.busy}
          disabled={command.recovery.busy || !command.canRetry}
          onClick={() => void command.send()}
        >
          {cashRecoveryMessages.retry}
        </Button>
      )}
    </>
  );
}
