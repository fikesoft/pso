import { Button } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import type { DraftSectionProps } from '../model/draft-ui.types';
export function DraftActions({ model, props }: DraftSectionProps) {
  return (
    <>
      <div className="form-footer">
        <Button
          type="button"
          variant="secondary"
          disabled={
            model.busy ||
            model.uncertain ||
            model.creation.recovering ||
            model.customerLookup.locked ||
            model.addresses.locked
          }
          onClick={props.onClose}
        >
          {text.discardDraft}
        </Button>
        {props.order && model.stale && (
          <Button type="button" busy={model.busy} onClick={() => void model.reload()}>
            {text.refresh}
          </Button>
        )}
        {(model.catalogStale || model.menuUnavailable) && (
          <Button type="button" busy={model.busy} onClick={() => void model.reloadCatalog()}>
            {text.refresh} · {text.catalog}
          </Button>
        )}
        {!model.stale && (!model.creation.recovering || model.creation.hasPayload()) && (
          <Button
            type="submit"
            busy={model.busy}
            disabled={
              model.customerLookup.locked ||
              model.addresses.locked ||
              model.draft.addressInvalid ||
              !model.creation.ready ||
              !model.draft.items.length ||
              !!model.pendingProduct ||
              model.catalogStale ||
              model.menuUnavailable
            }
          >
            {model.uncertain ? text.retry : text.saveDraft}
          </Button>
        )}
      </div>
    </>
  );
}
