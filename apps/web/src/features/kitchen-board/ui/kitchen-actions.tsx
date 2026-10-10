import { Button } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { KitchenActionsProps } from '../model/kitchen-board.types';
export function KitchenActions({ status, busy, onUpdate }: KitchenActionsProps) {
  return (
    <>
      {status === 'QUEUED' && (
        <Button className="full-width" busy={busy} onClick={() => onUpdate('PREPARING')}>
          {text.startPreparation}
        </Button>
      )}
      {status === 'PREPARING' && (
        <Button
          variant="secondary"
          className="full-width"
          busy={busy}
          onClick={() => onUpdate('PARTIALLY_READY')}
        >
          {text.markPartiallyReady}
        </Button>
      )}
      {(status === 'PREPARING' || status === 'PARTIALLY_READY') && (
        <Button className="full-width" busy={busy} onClick={() => onUpdate('READY')}>
          {text.markReady}
        </Button>
      )}
    </>
  );
}
