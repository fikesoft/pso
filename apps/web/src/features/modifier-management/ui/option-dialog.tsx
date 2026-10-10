import { Button, Field, Modal, Notice, Select } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { OptionDialogProps } from '../model/modifier-management.types';

export function OptionDialog({
  option,
  busy,
  error,
  onClose,
  onSave,
  onReload,
}: OptionDialogProps) {
  return (
    <Modal
      open={option !== undefined}
      title={option ? text.editOption : text.newOption}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <form
        key={`${option?.id ?? 'new'}:${option?.version ?? 0}`}
        className="form-stack"
        onSubmit={onSave}
      >
        {error && (
          <Notice>
            {error}
            {option && (
              <Button type="button" variant="secondary" busy={busy} onClick={() => void onReload()}>
                {common.refresh}
              </Button>
            )}
          </Notice>
        )}
        <fieldset className="operation-fields" disabled={busy}>
          <Field
            label={text.optionName}
            name="name"
            defaultValue={option?.name ?? ''}
            maxLength={100}
            required
          />
          <Field
            label={text.extraPrice}
            name="extraPrice"
            type="number"
            min={0}
            step="0.0001"
            defaultValue={option?.extraPrice ?? '0.0000'}
            required
          />
          <Field
            label={common.sortOrder}
            name="sortOrder"
            type="number"
            min={0}
            max={100000}
            step={1}
            defaultValue={option?.sortOrder ?? 0}
            required
          />
          {option && (
            <Select label={common.status} name="status" defaultValue={option.status}>
              <option value="ACTIVE">{common.active}</option>
              <option value="ARCHIVED">{common.archived}</option>
            </Select>
          )}
        </fieldset>
        <div className="form-footer">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            {common.cancel}
          </Button>
          <Button type="submit" busy={busy}>
            {text.saveOption}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
