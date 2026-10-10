import { Button, Notice } from '@pos/ui';
import {
  cashRecoveryMessages as recovery,
  addressManagementMessages as text,
} from '@pos/ui/locales';
import type { AddressBookViewProps } from '../model/address-book.types';
export function AddressBookRecovery({ model }: AddressBookViewProps) {
  const op = model.operation;
  return (
    <>
      {op.error && <Notice>{op.error}</Notice>}
      {op.notice && <Notice tone="success">{op.notice}</Notice>}
      {op.stale && <Notice tone="info">{text.refreshRequired}</Notice>}
      {op.recovering && (
        <>
          <Notice tone="info">{recovery.recovery}</Notice>
          <div className="inline">
            {op.hasAttempt && (
              <Button busy={op.busy} disabled={!op.canResolve} onClick={() => void op.send()}>
                {recovery.retry}
              </Button>
            )}
            <Button busy={op.busy} disabled={!op.canResolve} onClick={() => void op.resolve()}>
              {recovery.resolve}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
