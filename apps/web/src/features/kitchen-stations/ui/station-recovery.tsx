import { Button, Notice } from '@pos/ui';
import { cashRecoveryMessages as text, stationMessages } from '@pos/ui/locales';
import type { StationRecoveryProps } from '../model/station.types';
export function StationRecovery({ operation, onRefresh, refreshLabel }: StationRecoveryProps) {
  return (
    <>
      {operation.error && <Notice>{operation.error}</Notice>}
      {operation.notice && <Notice tone="success">{operation.notice}</Notice>}
      {operation.recovering && <Notice>{text.recovery}</Notice>}
      {operation.recovering && (
        <div className="inline">
          {operation.hasAttempt && (
            <Button busy={operation.busy} onClick={() => void operation.send()}>
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
      {operation.stale && (
        <Button disabled={operation.busy || operation.recovering} onClick={onRefresh}>
          {refreshLabel ?? stationMessages.refresh}
        </Button>
      )}
    </>
  );
}
