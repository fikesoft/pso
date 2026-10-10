import { useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import {
  cashRegisterCreateSchema,
  cashRegisterRenameSchema,
  cashRegisterArchiveSchema,
} from '@pos/contracts/cash-registers';
import { cashRegisterMessages as text } from '@pos/ui/locales';
import type { RegisterFormProps } from '../model/register-ui.types';
import { RegisterRecovery } from './register-recovery';
export function RegisterForm({
  edit,
  locationId,
  command,
  enabled,
  onCancel,
  onRefresh,
}: RegisterFormProps) {
  const [name, setName] = useState(edit.kind === 'CREATE' ? '' : edit.register.name);
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (command.locked || !enabled) return;
        setError('');
        const base = { locationId, requestKey: crypto.randomUUID() };
        if (edit.kind === 'CREATE') {
          const parsed = cashRegisterCreateSchema.safeParse({ ...base, code, name });
          if (!parsed.success) {
            setError(text.invalidForm);
            return;
          }
          void command.send({ kind: 'CREATE', body: parsed.data });
        } else if (edit.kind === 'RENAME') {
          const parsed = cashRegisterRenameSchema.safeParse({
            ...base,
            version: edit.register.version,
            name,
          });
          if (!parsed.success) {
            setError(text.invalidForm);
            return;
          }
          void command.send({ kind: 'RENAME', registerId: edit.register.id, body: parsed.data });
        } else if (confirmed) {
          const body = cashRegisterArchiveSchema.parse({ ...base, version: edit.register.version });
          void command.send({ kind: 'ARCHIVE', registerId: edit.register.id, body });
        }
      }}
    >
      {command.error && <Notice>{command.error}</Notice>}
      {error && <Notice>{error}</Notice>}
      {!enabled && <Notice>{text.forbidden}</Notice>}
      <RegisterRecovery command={command} enabled={enabled} />
      {command.stale && (
        <Notice>
          <p>{text.stale}</p>
          <Button type="button" variant="secondary" onClick={() => void onRefresh()}>
            {text.refresh}
          </Button>
        </Notice>
      )}
      {edit.kind === 'ARCHIVE' ? (
        <>
          <p>
            <strong>{edit.register.name}</strong> · {edit.register.code}
          </p>
          <p>{text.archiveHint}</p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              required
              disabled={command.locked}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {text.confirmArchive}
          </label>
        </>
      ) : (
        <>
          {edit.kind === 'CREATE' ? (
            <Field
              label={text.code}
              required
              maxLength={32}
              pattern="[A-Za-z0-9_\-]+"
              value={code}
              disabled={command.locked}
              onChange={(event) => setCode(event.target.value)}
            />
          ) : (
            <p>
              {text.code}: <strong>{edit.register.code}</strong>
            </p>
          )}
          <Field
            label={text.name}
            required
            maxLength={120}
            value={name}
            disabled={command.locked}
            onChange={(event) => setName(event.target.value)}
          />
        </>
      )}
      <div className="form-footer">
        <Button
          type="button"
          variant="secondary"
          disabled={command.busy || command.recovering}
          onClick={onCancel}
        >
          {text.cancel}
        </Button>
        <Button
          type="submit"
          busy={command.busy}
          disabled={command.locked || (edit.kind === 'ARCHIVE' && !confirmed)}
        >
          {edit.kind === 'ARCHIVE' ? text.archive : text.save}
        </Button>
      </div>
    </form>
  );
}
