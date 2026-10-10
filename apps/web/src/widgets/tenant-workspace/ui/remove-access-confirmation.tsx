import { roMessages, Button, Notice } from '@pos/ui';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function RemoveAccessConfirmation({ model }: WorkspaceComponentProps) {
  const { modal, setModal, busy, modalError, removeAccess } = model;
  return (
    <>
      <Notice tone="info">
        {modal?.kind.startsWith('remove-assignment:')
          ? roMessages.message324
          : roMessages.message326}
      </Notice>
      {modalError && <Notice>{modalError}</Notice>}
      <div className="form-footer">
        <Button variant="secondary" onClick={() => setModal(null)}>
          {roMessages.message321}
        </Button>
        <Button variant="danger" busy={busy} onClick={() => void removeAccess()}>
          {modal?.kind.startsWith('remove-assignment:')
            ? roMessages.message325
            : roMessages.message327}
        </Button>
      </div>
    </>
  );
}
