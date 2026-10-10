import { Button, Notice } from '@pos/ui';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type { CashRecoveryProps } from '../model/cash-command.types';
export function CashRecovery({ model }: CashRecoveryProps) {
  return (
    <>
      {model.error && <Notice>{model.error}</Notice>}
      {model.notice && <Notice tone="info">{model.notice}</Notice>}
      {model.uncertain && (
        <Notice tone="info">
          <p>{text.recovery}</p>
          <Button
            type="button"
            variant="secondary"
            busy={model.busy}
            disabled={!model.canResolve}
            onClick={() => void model.resolve()}
          >
            {text.resolve}
          </Button>
        </Notice>
      )}
    </>
  );
}
