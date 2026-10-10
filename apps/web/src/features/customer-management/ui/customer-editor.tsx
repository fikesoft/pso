import { useState } from 'react';
import { Button, Notice } from '@pos/ui';
import { errorMessage } from '@pos/ui/api';
import { customerManagementMessages as text } from '@pos/ui/locales';
import type { CustomerEditorProps } from '../model/customer-management.types';
import { customerProfileFromForm } from '../model/customer-profile';
import { CustomerProfileFields } from './customer-profile-fields';
export function CustomerEditor({
  customer,
  locationId,
  canUpdate,
  canArchive,
  operation,
  locked,
}: CustomerEditorProps) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const archived = customer.status === 'ARCHIVED';
  return (
    <div className="form-stack">
      <p>
        {archived ? text.archivedProfile : text.activeProfile} · {text.version} {customer.version}
      </p>
      {archived && <Notice tone="info">{text.archivedHint}</Notice>}
      {error && <Notice>{error}</Notice>}
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (locked || !canUpdate || archived) return;
          setError('');
          try {
            const profile = customerProfileFromForm(event.currentTarget);
            await operation.send({
              customerId: customer.id,
              locationId,
              action: 'UPDATE',
              version: customer.version,
              requestKey: crypto.randomUUID(),
              profile,
            });
          } catch (failure) {
            setError(errorMessage(failure));
          }
        }}
      >
        <CustomerProfileFields
          profile={customer}
          disabled={locked || !canUpdate || archived || confirm}
        />
        {canUpdate && !archived && (
          <Button type="submit" disabled={locked || confirm}>
            {text.save}
          </Button>
        )}
      </form>
      {canArchive && !confirm && (
        <Button variant="secondary" disabled={locked} onClick={() => setConfirm(true)}>
          {archived ? text.restore : text.archive}
        </Button>
      )}
      {canArchive && confirm && (
        <div className="form-stack">
          <Notice tone="info">{archived ? text.restoreHint : text.archiveHint}</Notice>
          <div className="inline">
            <Button
              disabled={locked}
              onClick={() =>
                void operation.send({
                  customerId: customer.id,
                  locationId,
                  action: archived ? 'RESTORE' : 'ARCHIVE',
                  version: customer.version,
                  requestKey: crypto.randomUUID(),
                })
              }
            >
              {text.confirm}
            </Button>
            <Button variant="secondary" disabled={locked} onClick={() => setConfirm(false)}>
              {text.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
