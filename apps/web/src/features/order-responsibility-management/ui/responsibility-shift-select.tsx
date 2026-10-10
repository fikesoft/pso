import { Button, Notice, Select } from '@pos/ui';
import { orderResponsibilityMessages as text } from '@pos/ui/locales';
import type { ResponsibilityWorkspaceModel } from '../model/responsibility-management.types';
export function ResponsibilityShiftSelect({
  model,
  disabled,
}: {
  model: ResponsibilityWorkspaceModel;
  disabled: boolean;
}) {
  const { shifts } = model;
  return (
    <div className="form-stack">
      <Select
        label={text.shift}
        value={shifts.id}
        disabled={disabled || shifts.loading}
        onChange={(event) => shifts.setId(event.target.value)}
      >
        <option value="">{text.chooseShift}</option>
        {shifts.data?.shifts.map((shift) => (
          <option key={shift.id} value={shift.id}>
            {shift.registerCode} · {shift.registerName} · {shift.ownerDisplayName}
            {shift.status === 'CLOSED' ? ` · ${text.closedShift}` : ''}
          </option>
        ))}
      </Select>
      {shifts.error && <Notice>{shifts.error}</Notice>}
      <div className="form-footer">
        <Button
          variant="secondary"
          disabled={disabled || shifts.loading}
          onClick={() => void shifts.refresh()}
        >
          {text.refreshShifts}
        </Button>
        {shifts.data?.nextCursor && (
          <Button
            variant="secondary"
            disabled={disabled || shifts.loading}
            onClick={() => void shifts.more()}
          >
            {text.moreShifts}
          </Button>
        )}
      </div>
    </div>
  );
}
