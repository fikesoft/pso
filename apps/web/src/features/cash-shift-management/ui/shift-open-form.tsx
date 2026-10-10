import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Notice, Select } from '@pos/ui';
import { cashShiftOpenSchema } from '@pos/contracts/cash-shifts';
import { cashShiftMessages as text } from '@pos/ui/locales';
import { readCashRegisters } from '../../../entities/cash-register';
import { useRemoteData } from '../../../shared/lib';
import type { ShiftOpenFormProps } from '../model/shift-management.types';
export function ShiftOpenForm({ props, command }: ShiftOpenFormProps) {
  const load = useCallback(
    () =>
      readCashRegisters(props.api, { locationId: props.locationId, status: 'ACTIVE', limit: 50 }),
    [props.api, props.locationId],
  );
  const registers = useRemoteData(load);
  useEffect(() => {
    if (registers.error) registers.setData(null);
  }, [registers.error, registers.setData]);
  const [registerId, setRegisterId] = useState(''),
    [amount, setAmount] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          command.locked ||
          !confirmed ||
          registers.error ||
          !registers.data?.registers.some((r) => r.id === registerId)
        )
          return;
        const parsed = cashShiftOpenSchema.safeParse({
          locationId: props.locationId,
          requestKey: crypto.randomUUID(),
          openingAmount: amount,
        });
        if (!parsed.success) {
          setError(text.invalid);
          return;
        }
        setError('');
        void command.send({ kind: 'OPEN', registerId, body: parsed.data });
      }}
    >
      {registers.error && <Notice>{registers.error}</Notice>}
      {error && <Notice>{error}</Notice>}
      <fieldset className="operation-fields" disabled={command.locked || registers.loading}>
        <Select
          label={text.register}
          value={registerId}
          onChange={(event) => setRegisterId(event.target.value)}
          required
        >
          <option value="">{text.chooseRegister}</option>
          {!registers.error &&
            registers.data?.registers.map((register) => (
              <option key={register.id} value={register.id}>
                {register.code} · {register.name}
              </option>
            ))}
        </Select>
        {registers.data?.nextCursor && !registers.error && (
          <Button
            type="button"
            variant="secondary"
            busy={registers.loadingMore}
            onClick={() =>
              void registers.append(
                () =>
                  readCashRegisters(props.api, {
                    locationId: props.locationId,
                    status: 'ACTIVE',
                    cursor: registers.data!.nextCursor!,
                  }),
                (old, page) => ({ ...page, registers: [...old.registers, ...page.registers] }),
              )
            }
          >
            {text.moreRegisters}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={() => void registers.refresh()}>
          {text.refresh}
        </Button>
        <Field
          label={text.opening}
          value={amount}
          required
          inputMode="decimal"
          pattern="[0-9]+([.][0-9]{1,2})?"
          onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
        />
        <label className="check-option">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>{text.confirmOpen}</span>
        </label>
      </fieldset>
      <div className="form-footer">
        <Button
          type="submit"
          busy={command.busy}
          disabled={command.locked || !confirmed || !registerId || !!registers.error}
        >
          {text.open}
        </Button>
      </div>
    </form>
  );
}
