import { Button, Field, Modal, Notice, Select } from '@pos/ui';
import { upsellMessages as text, operationalMessages as common } from '@pos/ui/locales';
import type { UpsellDialogProps } from '../model/upsell-management.types';
import { UpsellProducts } from './upsell-products';

export function UpsellDialog({ model, ...props }: UpsellDialogProps) {
  if (model.editing === undefined) return null;
  const rule = model.editing;
  return (
    <Modal
      open
      title={rule ? text.editRule : text.newRule}
      onOpenChange={(open) => {
        if (!open) model.edit(undefined);
      }}
    >
      {model.error && <Notice>{model.error}</Notice>}
      {model.uncertain && <Notice tone="info">{text.uncertain}</Notice>}
      <form
        className="form-stack"
        key={`${rule?.id ?? 'new'}:${rule?.version ?? 0}`}
        onSubmit={(event) => void model.save(event)}
      >
        <fieldset className="operation-fields" disabled={model.busy || model.uncertain}>
          <Field
            name="name"
            label={text.name}
            defaultValue={rule?.name ?? ''}
            required
            minLength={2}
            maxLength={100}
          />
          {rule ? (
            <div className="stack">
              <p>
                {rule.sourceProductName} → {rule.targetProductName}
              </p>
              <p className="muted">{text.pairHint}</p>
            </div>
          ) : (
            <UpsellProducts {...props} />
          )}
          <Field
            name="sortOrder"
            label={text.sortOrder}
            type="number"
            min={0}
            max={100000}
            step={1}
            required
            defaultValue={rule?.sortOrder ?? 0}
            hint={text.orderHint}
          />
          {rule && (
            <Select name="status" label={common.status} defaultValue={rule.status}>
              <option value="ACTIVE">{common.active}</option>
              <option value="ARCHIVED">{common.archived}</option>
            </Select>
          )}
        </fieldset>
        <div className="form-footer">
          <Button
            type="button"
            variant="secondary"
            disabled={model.busy || model.uncertain}
            onClick={() => model.edit(undefined)}
          >
            {common.cancel}
          </Button>
          {rule && model.error && (
            <Button
              type="button"
              variant="secondary"
              busy={model.busy}
              onClick={() => void model.reload()}
            >
              {common.refresh}
            </Button>
          )}
          <Button type="submit" busy={model.busy}>
            {model.uncertain ? common.retry : text.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
