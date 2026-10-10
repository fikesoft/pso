import { Select } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { MANUAL_ORDER_SOURCES } from '@pos/contracts/orders';
import type { ManualOrderSource } from '@pos/contracts';
import { ORDER_SOURCE_LABELS } from '../../../shared/config/operations.constants';
import type { DraftSectionProps } from '../model/draft-ui.types';
export function DraftSource({ model, props }: DraftSectionProps) {
  return (
    <>
      {!props.order && (
        <Select
          label={text.orderSource}
          value={model.source}
          disabled={model.locked || !!props.tableContext}
          onChange={(event) => model.setSource(event.target.value as ManualOrderSource)}
        >
          {MANUAL_ORDER_SOURCES.map((source) => (
            <option key={source} value={source}>
              {ORDER_SOURCE_LABELS[source]}
            </option>
          ))}
        </Select>
      )}
    </>
  );
}
