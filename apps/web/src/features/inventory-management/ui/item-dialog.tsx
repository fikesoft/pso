import { Button, Modal, Notice } from '@pos/ui';
import { inventoryMessages as text, operationalMessages } from '@pos/ui/locales';
import type { ItemEditorProps } from '../model/inventory.types';
import { useItemEditor } from '../model/use-item-editor';
import { ItemFields } from './item-fields';
export function ItemDialog(props: ItemEditorProps) {
  const model = useItemEditor(props);
  return (
    <Modal
      open
      title={props.item ? text.editItem : text.newItem}
      description={text.sharedItem}
      onOpenChange={(open) => {
        if (!open && !model.busy) props.onClose();
      }}
    >
      <form className="form-stack" onSubmit={(event) => void model.save(event)}>
        {model.error && <Notice>{model.error}</Notice>}
        {model.stale && <Notice tone="info">{text.staleItem}</Notice>}
        <ItemFields model={model} />
        {props.item && (
          <p className="scope-hint">
            {text.immutableItem} {text.archiveHint}
          </p>
        )}
        <div className="form-footer">
          <Button type="button" variant="secondary" disabled={model.busy} onClick={props.onClose}>
            {operationalMessages.cancel}
          </Button>
          {model.stale && (
            <Button
              type="button"
              variant="secondary"
              busy={model.busy}
              onClick={() => void model.reload()}
            >
              {operationalMessages.refresh}
            </Button>
          )}
          <Button type="submit" busy={model.busy} disabled={model.stale}>
            {props.item ? text.saveItem : text.createItem}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
