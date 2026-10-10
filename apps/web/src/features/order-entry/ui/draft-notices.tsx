import { Button, Notice } from '@pos/ui';
import {
  operationalMessages as text,
  orderCreationMessages as creationText,
} from '@pos/ui/locales';
import type { DraftSectionProps } from '../model/draft-ui.types';
export function DraftNotices({ model }: DraftSectionProps) {
  return (
    <>
      {model.creation.error && <Notice>{model.creation.error}</Notice>}
      {model.creation.notice && <Notice tone="info">{model.creation.notice}</Notice>}
      {model.creation.recovering && <Notice tone="info">{creationText.recovery}</Notice>}
      {model.creation.recovering && (
        <Button type="button" busy={model.busy} onClick={() => void model.creation.resolve()}>
          {creationText.resolve}
        </Button>
      )}
      {model.error && <Notice>{model.error}</Notice>}
      {model.hint && <Notice tone="info">{model.hint}</Notice>}
      {model.catalogStale && (
        <Notice tone="info">
          {text.modifierConfigurationStale} {text.modifierChoicesLocked}
        </Notice>
      )}
    </>
  );
}
