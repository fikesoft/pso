import { Button, Field, Modal, Notice, Select } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { CategoryDialogProps } from '../model/catalog-management.types';
export function CategoryDialog({
  category,
  open,
  busy,
  error,
  onClose,
  onSubmit,
  onReload,
  loading,
}: CategoryDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      title={category ? text.editCategory : text.newCategory}
      description={text.categoryScope}
    >
      <form
        key={`${category?.id ?? 'new'}:${category?.version ?? 0}`}
        className="form-stack"
        onSubmit={onSubmit}
      >
        {error && (
          <Notice>
            {error}
            {category && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onReload()}
                busy={loading}
              >
                {text.refresh}
              </Button>
            )}
          </Notice>
        )}
        <fieldset className="operation-fields" disabled={busy || loading}>
          <Field
            label={text.categoryName}
            name="name"
            defaultValue={category?.name ?? ''}
            required
            maxLength={100}
          />
          <Field
            label={text.sortOrder}
            hint={text.categoryOrderHint}
            name="sortOrder"
            type="number"
            defaultValue={category?.sortOrder ?? 0}
            min={0}
            max={100000}
            step={1}
            required
          />
          {category && (
            <>
              <Select label={text.status} name="status" defaultValue={category.status}>
                <option value="ACTIVE">{text.active}</option>
                <option value="ARCHIVED">{text.archived}</option>
              </Select>
              <p className="muted text-small">{text.archiveCategoryHint}</p>
            </>
          )}
        </fieldset>
        <div className="form-footer">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            {text.cancel}
          </Button>
          <Button type="submit" busy={busy} disabled={loading}>
            {text.saveCategory}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
