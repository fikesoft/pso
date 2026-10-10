import { roMessages, Button, Field, Modal, Plus } from '@pos/ui';
import type { DemoPosComponentProps } from '../model/demo-pos.types';
export function DemoProductDialog({ model }: DemoPosComponentProps) {
  const { selected, setSelected, addProduct } = model;
  return (
    <Modal
      open={!!selected}
      onOpenChange={(open) => !open && setSelected(null)}
      title={selected?.name || roMessages.message066}
      description={roMessages.message067}
    >
      {selected && (
        <form className="form-stack" onSubmit={addProduct}>
          <p>{selected.detail}</p>
          <div className="check-options">
            <label className="check-option">
              <input type="checkbox" defaultChecked />
              {roMessages.message069}
            </label>
            <label className="check-option">
              <input type="checkbox" defaultChecked />
              {roMessages.message070}
            </label>
          </div>
          <Field
            label={roMessages.message071}
            name="note"
            placeholder={roMessages.message072}
            hint={roMessages.message073}
          />
          <Button type="submit">
            <Plus size={17} />
            {roMessages.message074}
          </Button>
        </form>
      )}
    </Modal>
  );
}
