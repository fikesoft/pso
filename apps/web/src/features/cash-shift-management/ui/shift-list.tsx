import { Badge, Button, Empty, Loading, Notice, Select } from '@pos/ui';
import { cashShiftMessages as text } from '@pos/ui/locales';
import type { ShiftListProps } from '../model/shift-management.types';
export function ShiftList({ model, disabled, canReport, onOpen }: ShiftListProps) {
  return (
    <>
      <div className="inline">
        <Select
          label={text.status}
          value={model.status}
          disabled={disabled || model.loading}
          onChange={(event) => model.setStatus(event.target.value as 'OPEN' | 'CLOSED' | 'ALL')}
        >
          <option value="OPEN">{text.openFilter}</option>
          <option value="CLOSED">{text.closedFilter}</option>
          <option value="ALL">{text.all}</option>
        </Select>
        {canReport && (
          <Select
            label={text.view}
            value={model.view}
            disabled={disabled || model.loading}
            onChange={(event) => model.setView(event.target.value as 'MINE' | 'ALL')}
          >
            <option value="MINE">{text.mine}</option>
            <option value="ALL">{text.allOwners}</option>
          </Select>
        )}
        <Button
          variant="secondary"
          busy={model.loading}
          disabled={disabled}
          onClick={() => void model.refresh()}
        >
          {text.refresh}
        </Button>
      </div>
      {model.error && <Notice>{model.error}</Notice>}
      {model.loading && !model.data && <Loading />}
      {!model.error && !model.loading && !model.data?.shifts.length && (
        <Empty title={text.empty} description={text.emptyHint} />
      )}
      {!model.error && (
        <div className="operation-order-list">
          {model.data?.shifts.map((shift) => (
            <article className="operation-order-card" key={shift.id}>
              <div className="operation-card-heading">
                <h3>
                  {shift.registerCode} · {shift.registerName}
                </h3>
                <Badge>{shift.status === 'OPEN' ? text.openStatus : text.closedStatus}</Badge>
              </div>
              <p>
                {text.owner}: {shift.ownerDisplayName}
              </p>
              <p>
                {text.openingAmount}: {shift.openingAmount} MDL
              </p>
              <Button
                variant="secondary"
                disabled={disabled || model.loading}
                onClick={() => onOpen(shift.id)}
              >
                {text.details}
              </Button>
            </article>
          ))}
        </div>
      )}
      {model.data?.nextCursor && !model.error && (
        <Button
          variant="secondary"
          busy={model.loading}
          disabled={disabled}
          onClick={() => void model.more()}
        >
          {text.more}
        </Button>
      )}
    </>
  );
}
