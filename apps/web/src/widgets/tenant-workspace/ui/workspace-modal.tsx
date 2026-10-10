import { roMessages, Modal } from '@pos/ui';
import { useState } from 'react';
import type { WorkspaceComponentProps } from '../model/workspace.types';
import { workspaceModalTitle } from '../lib/modal-title';
import { WorkspaceForms } from './workspace-forms';
import { RoleHistory } from './role-history';
import { PersonDetails } from './person-details';
import { SensitiveConfirmation } from './sensitive-confirmation';
import { RemoveAccessConfirmation } from './remove-access-confirmation';
export function WorkspaceModal({ model }: WorkspaceComponentProps) {
  const [imageLocked, setImageLocked] = useState(false);
  const { modal, setModal, setModalError } = model;
  return (
    <Modal
      open={!!modal}
      onOpenChange={(open) => {
        if (!open && !model.busy && !imageLocked) {
          setModal(null);
          setModalError('');
        }
      }}
      title={workspaceModalTitle(modal)}
      description={modal?.kind === 'person' ? roMessages.message302 : roMessages.message303}
    >
      <WorkspaceForms model={model} />
      <RoleHistory model={model} />
      {modal?.kind === 'person' && (
        <PersonDetails model={model} imageLocked={imageLocked} onLockedChange={setImageLocked} />
      )}
      <SensitiveConfirmation model={model} />
      {modal?.kind.startsWith('remove-') && <RemoveAccessConfirmation model={model} />}
    </Modal>
  );
}
