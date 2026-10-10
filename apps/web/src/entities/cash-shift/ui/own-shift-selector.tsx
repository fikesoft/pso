import { Button, Notice, Select } from '@pos/ui';
import { cashShiftMessages as text } from '@pos/ui/locales';
import type { OwnShiftSelectorProps } from '../model/cash-shift.types';
export function OwnShiftSelector({ model, disabled = false }: OwnShiftSelectorProps) {
  return (
    <div className="form-stack">
      {!model.enabled && <Notice>{text.forbidden}</Notice>}
      {model.error && <Notice>{model.error}</Notice>}
      <Select
        label={text.selector}
        value={model.selectedId}
        disabled={disabled || model.loading || !model.enabled}
        onChange={(event) => model.select(event.target.value)}
        required
      >
        <option value="">{text.chooseShift}</option>
        {model.selectedId && !model.selected && (
          <option value={model.selectedId}>{text.unavailable}</option>
        )}
        {model.data?.shifts.map((shift) => (
          <option key={shift.id} value={shift.id}>
            {shift.registerCode} · {shift.registerName}
          </option>
        ))}
      </Select>
      {!model.loading && model.enabled && !model.error && !model.data?.shifts.length && (
        <p className="scope-hint">{text.noShift}</p>
      )}
      <div className="inline">
        <Button
          type="button"
          variant="secondary"
          busy={model.loading}
          disabled={disabled || !model.enabled}
          onClick={() => void model.refresh()}
        >
          {text.refresh}
        </Button>
        {model.data?.nextCursor && (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || model.loading}
            onClick={() => void model.more()}
          >
            {text.more}
          </Button>
        )}
      </div>
    </div>
  );
}
