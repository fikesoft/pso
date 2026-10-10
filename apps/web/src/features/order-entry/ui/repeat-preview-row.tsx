import { Button, Notice } from '@pos/ui';
import { repeatMessages as text } from '@pos/ui/locales';
import { ModifierSnapshot } from '../../../entities/modifier';
import { canRepairRepeatRow } from '../lib/order-repeat';
import type { RepeatRowProps } from '../model/order-repeat.types';
export function RepeatPreviewRow({ row, disabled, onRemove, onRepair }: RepeatRowProps) {
  return (
    <article className="order-draft-item" data-testid="repeat-line">
      <h3>{row.line.historical.productName}</h3>
      <p>
        {text.quantity}: {row.line.historical.quantity}
      </p>
      {row.line.historical.note && <p>{row.line.historical.note}</p>}
      <p>
        {text.historical}: {row.line.historical.unitPrice} MDL
      </p>
      {row.draft && (
        <p>
          {text.current}: {row.draft.price} MDL
        </p>
      )}
      <ModifierSnapshot groups={row.draft?.modifierGroups ?? row.line.historical.modifierGroups} />
      {row.removed ? (
        <Notice tone="info">{text.removed}</Notice>
      ) : (
        <>
          {row.line.issues.length > 0 && (
            <ul>
              {row.line.issues.map((issue, index) => (
                <li key={`${issue.code}:${index}`}>{text.issues[issue.code]}</li>
              ))}
            </ul>
          )}
          {!row.line.candidate && row.draft && <Notice tone="info">{text.repaired}</Notice>}
          {!row.draft && <Notice>{text.unresolved}</Notice>}
          <div className="form-footer">
            {canRepairRepeatRow(row) && (
              <Button type="button" variant="secondary" disabled={disabled} onClick={onRepair}>
                {text.repair}
              </Button>
            )}
            <Button type="button" variant="secondary" disabled={disabled} onClick={onRemove}>
              {text.remove}
            </Button>
          </div>
        </>
      )}
    </article>
  );
}
