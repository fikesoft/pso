import { Button, Loading, Modal, Notice } from '@pos/ui';
import { repeatMessages as text } from '@pos/ui/locales';
import { useRepeatPreview } from '../model/use-repeat-preview';
import type { RepeatPreviewProps } from '../model/order-repeat.types';
import { RepeatPreviewRow } from './repeat-preview-row';
import { OrderModifierPicker } from './order-modifier-picker';
import { repeatProductAvailable } from '../lib/order-repeat';
export function OrderRepeatPreview(input: RepeatPreviewProps) {
  const preview = useRepeatPreview(input);
  return (
    <Modal
      open
      title={`${text.title} #${input.source.number}`}
      description={text.hint}
      onOpenChange={(open) => {
        if (!open) input.props.onCloseRepeat?.();
      }}
    >
      <div className="form-stack">
        <p>{text.metadata}</p>
        <Button type="button" variant="secondary" busy={preview.loading} onClick={preview.refresh}>
          {text.refresh}
        </Button>
        {preview.loading && <Loading />}
        {preview.error && <Notice>{preview.error}</Notice>}
        {preview.locked && <Notice>{text.locked}</Notice>}
        {preview.ready && (
          <>
            {preview.data?.amountAllowed === false && <Notice>{text.overLimit}</Notice>}
            {preview.rows.map((row) => (
              <RepeatPreviewRow
                key={row.line.sourceItemId}
                row={row}
                disabled={preview.locked || !!preview.editing}
                onRemove={() => preview.remove(row.line.sourceItemId)}
                onRepair={() => preview.repair(row.line.sourceItemId)}
              />
            ))}
            <p>
              {preview.modified
                ? text.modified
                : preview.data?.estimatedTotal !== null
                  ? `${text.total}: ${preview.data?.estimatedTotal} MDL`
                  : text.unavailableTotal}
            </p>
            {input.model.draft.items.length > 0 && (
              <label className="inline">
                <input
                  type="checkbox"
                  checked={preview.confirmed}
                  disabled={preview.locked}
                  onChange={(event) => preview.setConfirmed(event.target.checked)}
                />
                {text.confirmReplace}
              </label>
            )}
            <div className="form-footer">
              <Button type="button" variant="secondary" onClick={input.props.onCloseRepeat}>
                {text.cancel}
              </Button>
              <Button
                type="button"
                disabled={
                  preview.locked ||
                  !preview.lines ||
                  !!preview.editing ||
                  (input.model.draft.items.length > 0 && !preview.confirmed)
                }
                onClick={preview.apply}
              >
                {text.apply}
              </Button>
            </div>
          </>
        )}
        {preview.editing?.product && (
          <Modal
            open
            title={text.repair}
            description={preview.editing.product.name}
            onOpenChange={(open) => {
              if (!open) preview.cancelRepair();
            }}
          >
            <OrderModifierPicker
              product={preview.editing.product}
              available={repeatProductAvailable(preview.editing.product)}
              choices={preview.choices}
              disabled={preview.locked}
              onToggle={preview.toggle}
              onCancel={preview.cancelRepair}
              onConfirm={preview.confirmRepair}
            />
          </Modal>
        )}
      </div>
    </Modal>
  );
}
