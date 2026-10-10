import { Button, Notice } from '@pos/ui';
import { cashRecoveryMessages as text, packingMessages } from '@pos/ui/locales';
import type { PackingRecoveryProps } from '../model/packing-board.types';
export function PackingRecovery({ operation }: PackingRecoveryProps) {
  return (
    <>
      {operation.error && <Notice>{operation.error}</Notice>}
      {operation.notice && <Notice tone="success">{operation.notice}</Notice>}
      {operation.stale && <Notice tone="info">{packingMessages.refreshRequired}</Notice>}
      {operation.recovering && <Notice tone="info">{text.recovery}</Notice>}
      {operation.recovering && (
        <div className="inline">
          {operation.hasAttempt && (
            <Button
              busy={operation.busy}
              disabled={!operation.canResolve}
              onClick={() => void operation.send()}
            >
              {text.retry}
            </Button>
          )}
          <Button
            busy={operation.busy}
            disabled={!operation.canResolve}
            onClick={() => void operation.resolve()}
          >
            {text.resolve}
          </Button>
        </div>
      )}
    </>
  );
}
