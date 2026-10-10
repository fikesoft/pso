import { MAX_GROUP_SELECTIONS } from '@pos/contracts/modifiers';
import { Button, Field, Modal, Notice, Select } from '@pos/ui';
import { modifierMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { GroupDialogProps } from '../model/modifier-management.types';

export function GroupDialog({ group, busy, error, onClose, onSave, onReload }: GroupDialogProps) {
  return (
    <Modal
      open={group !== undefined}
      title={group ? text.editGroup : text.newGroup}
      description={text.groupHint}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <form
        key={`${group?.id ?? 'new'}:${group?.version ?? 0}`}
        className="form-stack"
        onSubmit={onSave}
      >
        {error && (
          <Notice>
            {error}
            {group && (
              <Button type="button" variant="secondary" busy={busy} onClick={() => void onReload()}>
                {common.refresh}
              </Button>
            )}
          </Notice>
        )}
        <fieldset className="operation-fields" disabled={busy}>
          <Field
            label={text.groupName}
            name="name"
            defaultValue={group?.name ?? ''}
            maxLength={100}
            required
          />
          <Field
            label={text.minimum}
            name="minSelections"
            type="number"
            min={0}
            max={MAX_GROUP_SELECTIONS}
            step={1}
            defaultValue={group?.minSelections ?? 0}
            required
          />
          <Field
            label={text.maximum}
            name="maxSelections"
            type="number"
            min={1}
            max={MAX_GROUP_SELECTIONS}
            step={1}
            defaultValue={group?.maxSelections ?? 1}
            required
          />
          <Field
            label={common.sortOrder}
            name="sortOrder"
            type="number"
            min={0}
            max={100000}
            step={1}
            defaultValue={group?.sortOrder ?? 0}
            required
          />
          {group && (
            <Select label={common.status} name="status" defaultValue={group.status}>
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
            {text.saveGroup}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
