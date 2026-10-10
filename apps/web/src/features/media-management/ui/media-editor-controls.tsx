import { Button, Modal, Notice } from '@pos/ui';
import { mediaMessages as text } from '@pos/ui/locales';
import type { MediaEditorControlsProps } from '../model/media.types';
import { MediaFileField } from './media-file-field';

export function MediaEditorControls({ model, resource }: MediaEditorControlsProps) {
  return (
    <>
      {model.error && <Notice>{model.error}</Notice>}
      {model.saved && <Notice tone="success">{text.saved}</Notice>}
      {model.uncertain && (
        <Notice tone="info">
          {text.unknown}
          <Button type="button" busy={model.busy} onClick={() => void model.submit()}>
            {text.retry}
          </Button>
        </Notice>
      )}
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void model.submit('SET');
        }}
      >
        <MediaFileField model={model} resource={resource} />
        <p className="muted text-small">{text.hint}</p>
        <div className="attendance-controls">
          <Button type="submit" disabled={model.locked || !model.file}>
            {text.save}
          </Button>
          {resource.url && (
            <Button
              type="button"
              variant="secondary"
              disabled={model.locked}
              onClick={() => model.setConfirmClear(true)}
            >
              {text.remove}
            </Button>
          )}
        </div>
      </form>
      <Modal
        open={model.confirmClear}
        title={text.removeTitle}
        onOpenChange={(open) => {
          if (!model.locked) model.setConfirmClear(open);
        }}
      >
        <div className="form-stack">
          <p>{text.removeHint}</p>
          {model.error && <Notice>{model.error}</Notice>}
          {model.uncertain && <Notice tone="info">{text.unknown}</Notice>}
          <div className="form-footer">
            <Button
              type="button"
              variant="secondary"
              disabled={model.locked}
              onClick={() => model.setConfirmClear(false)}
            >
              {text.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              busy={model.busy}
              onClick={() => void model.submit(model.uncertain ? undefined : 'CLEAR')}
            >
              {model.uncertain ? text.retry : text.remove}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
