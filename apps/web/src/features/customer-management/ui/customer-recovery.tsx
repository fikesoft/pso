import { Button, Notice } from '@pos/ui';
import {
  cashRecoveryMessages as recovery,
  customerManagementMessages as text,
} from '@pos/ui/locales';
import type { CustomerDirectoryModel } from '../model/customer-management.types';
export function CustomerRecovery({ operation }: Pick<CustomerDirectoryModel, 'operation'>) {
  return (
    <>
      {operation.error && <Notice>{operation.error}</Notice>}
      {operation.notice && <Notice tone="success">{operation.notice}</Notice>}
      {operation.stale && <Notice tone="info">{text.refreshRequired}</Notice>}
      {operation.recovering && (
        <>
          <Notice tone="info">{recovery.recovery}</Notice>
          <div className="inline">
            {operation.hasAttempt && (
              <Button
                busy={operation.busy}
                disabled={!operation.canResolve}
                onClick={() => void operation.send()}
              >
                {recovery.retry}
              </Button>
            )}
            <Button
              busy={operation.busy}
              disabled={!operation.canResolve}
              onClick={() => void operation.resolve()}
            >
              {recovery.resolve}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
