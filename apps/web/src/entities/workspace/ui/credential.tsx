import { roMessages, pinMessages, Button, Modal } from '@pos/ui';
import type { CredentialProps } from '../model/credential.types';
export function Credential({ credential, onDismiss }: CredentialProps) {
  const pin = credential.kind === 'PIN';
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      title={pin ? pinMessages.issuedTitle : roMessages.message101}
    >
      <div className="credential" role="status">
        <code aria-label={pin ? pinMessages.pinLabel : roMessages.message411}>
          {credential.value}
        </code>
        <p>{pin ? pinMessages.issuedHint : roMessages.message102}</p>
        <Button variant="secondary" type="button" onClick={onDismiss}>
          {pin ? pinMessages.savedPin : roMessages.message103}
        </Button>
      </div>
    </Modal>
  );
}
