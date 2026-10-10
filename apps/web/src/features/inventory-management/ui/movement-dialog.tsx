import { Button, Field, Modal, Notice } from '@pos/ui';
import { inventoryMessages as text, operationalMessages } from '@pos/ui/locales';
import type { MovementEditorProps } from '../model/inventory.types';
import { useMovementEditor } from '../model/use-movement-editor';
import {
  MOVEMENT_LABELS,
  INVENTORY_UNIT_SYMBOLS,
  INVENTORY_QUANTITY_PATTERN,
} from '../config/inventory.constants';
export function MovementDialog(props: MovementEditorProps) {
  const model = useMovementEditor(props);
  const { action } = model;
  const count = props.kind === 'COUNT';
  return (
    <Modal
      open
      title={MOVEMENT_LABELS[props.kind]}
      description={props.item.name}
      onOpenChange={(open) => {
        if (!open && !action.locked) props.onClose();
      }}
    >
      <form className="form-stack" onSubmit={model.save}>
        {action.error && <Notice>{action.error}</Notice>}
        {action.uncertain && <Notice tone="info">{operationalMessages.retryUnknown}</Notice>}
        {action.stale && <Notice tone="info">{text.staleCount}</Notice>}
        <p>
          {count ? text.expectedQuantity : text.balance}:{' '}
          <strong>
            {model.item.balance} {INVENTORY_UNIT_SYMBOLS[model.item.unit]}
          </strong>
        </p>
        <fieldset
          className="operation-fields"
          disabled={action.locked || action.stale || model.loading}
        >
          <Field
            label={count ? text.countedQuantity : text.quantity}
            value={model.quantity}
            onChange={(event) => model.setQuantity(event.target.value.replace(',', '.'))}
            pattern={INVENTORY_QUANTITY_PATTERN}
            inputMode="decimal"
            required
            hint={text.quantityHint}
          />
          <Field
            label={text.reason}
            value={model.reason}
            onChange={(event) => model.setReason(event.target.value)}
            required
            minLength={3}
            maxLength={500}
          />
        </fieldset>
        {(count || props.kind === 'WASTE') && (
          <p className="scope-hint">{count ? text.countHint : text.wasteHint}</p>
        )}
        <div className="form-footer">
          <Button
            type="button"
            variant="secondary"
            disabled={action.locked}
            onClick={props.onClose}
          >
            {operationalMessages.cancel}
          </Button>
          {action.stale && (
            <Button
              type="button"
              variant="secondary"
              busy={model.loading}
              onClick={() => void model.reload()}
            >
              {operationalMessages.refresh}
            </Button>
          )}
          <Button type="submit" busy={action.busy} disabled={action.stale || model.loading}>
            {action.uncertain ? operationalMessages.retry : text.saveMovement}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
