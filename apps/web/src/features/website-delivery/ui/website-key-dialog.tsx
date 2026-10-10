import { Button, Field, Modal, Notice } from '@pos/ui';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import type { WebsiteConnectionModelProps } from '../model/website-delivery.types';
import { WebsiteKeyForm } from './website-key-form';
export function WebsiteKeyDialog({ model }: WebsiteConnectionModelProps) {
  if (model.secret)
    return (
      <Modal
        open
        title={text.issuedTitle}
        description={text.oneTimeHint}
        onOpenChange={(open) => {
          if (!open) model.setSecret(null);
        }}
      >
        <Notice tone="info">{text.keyScopeHint}</Notice>
        <Field
          label={text.secret}
          readOnly
          autoComplete="off"
          spellCheck={false}
          value={model.secret}
          onFocus={(event) => event.target.select()}
        />
        <div className="form-footer">
          <Button onClick={() => model.setSecret(null)}>{text.closeSecret}</Button>
        </div>
      </Modal>
    );
  if (model.dialog?.kind === 'key')
    return (
      <WebsiteKeyForm
        key={model.dialog.connection.id}
        connection={model.dialog.connection}
        model={model}
      />
    );
  if (model.dialog?.kind !== 'revoke') return null;
  const key = model.dialog.key;
  return (
    <Modal
      open
      title={text.revokeTitle}
      description={text.revokeHint}
      onOpenChange={(open) => {
        if (!open && !model.busy) model.setDialog(null);
      }}
    >
      {model.error && <Notice>{model.error}</Notice>}
      <p>{key.name}</p>
      <p className="website-reference">{key.id}</p>
      <div className="form-footer">
        <Button variant="secondary" disabled={model.busy} onClick={() => model.setDialog(null)}>
          {text.cancel}
        </Button>
        <Button variant="danger" busy={model.busy} onClick={() => void model.revoke(key.id)}>
          {text.confirmRevoke}
        </Button>
      </div>
    </Modal>
  );
}
