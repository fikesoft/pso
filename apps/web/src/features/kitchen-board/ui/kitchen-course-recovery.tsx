import { Button, Notice } from '@pos/ui';
import { cashRecoveryMessages as text, kitchenCourseMessages as courses } from '@pos/ui/locales';
import type { KitchenCourseRecoveryProps } from '../model/kitchen-board.types';

export function KitchenCourseRecovery({ operation }: KitchenCourseRecoveryProps) {
  return (
    <>
      {operation.error && <Notice>{operation.error}</Notice>}
      {operation.notice && <Notice tone="success">{operation.notice}</Notice>}
      {operation.stale && <Notice tone="info">{courses.refreshRequired}</Notice>}
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
