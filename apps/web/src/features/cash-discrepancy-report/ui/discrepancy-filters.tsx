import { Button, Field, Notice, Select } from '@pos/ui';
import { cashDiscrepancyMessages as text } from '@pos/ui/locales';
import type { DiscrepancyModel } from '../model/cash-discrepancy.types';
export function DiscrepancyFilters({ model }: { model: DiscrepancyModel }) {
  const { fields, setFields, registers } = model;
  const optionsMatch =
    model.query?.closedFrom === fields.closedFrom &&
    model.query?.closedTo === fields.closedTo &&
    model.query?.discrepancy === fields.discrepancy;
  const options = registers.data?.registers ?? [];
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        model.apply();
      }}
    >
      <div className="form-grid">
        <Field
          type="date"
          label={text.from}
          required
          value={fields.closedFrom}
          onChange={(event) =>
            setFields({ ...fields, closedFrom: event.target.value, registerId: '' })
          }
        />
        <Field
          type="date"
          label={text.to}
          required
          value={fields.closedTo}
          onChange={(event) =>
            setFields({ ...fields, closedTo: event.target.value, registerId: '' })
          }
        />
        <Select
          label={text.filter}
          value={fields.discrepancy}
          onChange={(event) =>
            setFields({
              ...fields,
              discrepancy: event.target.value === 'NONZERO' ? 'NONZERO' : 'ALL',
              registerId: '',
            })
          }
        >
          <option value="ALL">{text.all}</option>
          <option value="NONZERO">{text.nonzero}</option>
        </Select>
        <Select
          label={text.register}
          value={fields.registerId}
          onChange={(event) => setFields({ ...fields, registerId: event.target.value })}
          disabled={!optionsMatch || !registers.data || registers.loading}
        >
          <option value="">{text.allRegisters}</option>
          {options.map((row) => (
            <option key={row.registerId} value={row.registerId}>
              {row.registerCode} · {row.registerName}
            </option>
          ))}
        </Select>
      </div>
      <p>{text.registerHint}</p>
      {model.validation && <Notice>{model.validation}</Notice>}
      {registers.error && <Notice>{registers.error}</Notice>}
      <div className="form-footer">
        <Button type="submit" disabled={model.loading}>
          {text.apply}
        </Button>
        <Button variant="secondary" onClick={model.reset}>
          {text.reset}
        </Button>
        {optionsMatch && registers.data?.nextCursor && (
          <Button
            variant="secondary"
            disabled={registers.loading}
            onClick={() => void registers.more()}
          >
            {text.moreRegisters}
          </Button>
        )}
      </div>
    </form>
  );
}
