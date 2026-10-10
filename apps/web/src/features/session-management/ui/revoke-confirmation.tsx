import { Button, Modal, Notice } from '@pos/ui';
import { sessionMessages as text } from '@pos/ui/locales';
import type { SessionComponentProps } from '../model/session-management.types';

export function RevokeConfirmation({ model }: SessionComponentProps) {
  const target = model.target;
  if (!target || model.sessions.error) return null;
  const self = model.isOwn && (target === 'all' || target.current);
  return (
    <Modal
      open
      title={text.confirmTitle}
      description={target === 'all' ? text.confirmAll : text.confirmOne}
      onOpenChange={(open) => {
        if (!open && !model.busy) model.setTarget(null);
      }}
    >
      <div className="stack">
        <p>{target === 'all' ? text.confirmAll : text.confirmOne}</p>
        {self && <Notice tone="info">{text.confirmOwn}</Notice>}
        {model.actionError && <Notice>{model.actionError}</Notice>}
        <div className="form-footer">
          <Button variant="secondary" disabled={model.busy} onClick={() => model.setTarget(null)}>
            {text.cancel}
          </Button>
          <Button variant="danger" busy={model.busy} onClick={() => void model.confirm()}>
            {text.confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
