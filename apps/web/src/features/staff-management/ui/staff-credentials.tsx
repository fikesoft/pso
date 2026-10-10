import { PIN_MIN_LENGTH, PIN_MAX_LENGTH, PIN_PATTERN } from '@pos/contracts/pin';
import { roMessages, pinMessages, normalizePinInput, Field, Select, Notice } from '@pos/ui';
import type { AuthenticationMethod } from '@pos/ui/types';
import type { StaffCredentialsProps } from '../model/staff-credentials.types';
export function StaffCredentials({
  users,
  method,
  setMethod,
  requiresPassword,
}: StaffCredentialsProps) {
  return (
    <>
      <Field
        label={roMessages.message129}
        name="login"
        minLength={3}
        pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]*"
        autoComplete="off"
        required
        hint={method === 'PIN' ? pinMessages.managementLogin : roMessages.message130}
      />
      <Select
        label={pinMessages.methodLabel}
        value={requiresPassword ? 'PASSWORD' : method}
        onChange={(event) => setMethod(event.target.value as AuthenticationMethod)}
      >
        <option value="PIN" disabled={requiresPassword}>
          {pinMessages.pinMethod}
        </option>
        <option value="PASSWORD">{pinMessages.passwordMethod}</option>
      </Select>
      {requiresPassword && <Notice tone="info">{pinMessages.administrativeRole}</Notice>}
      {method === 'PIN' && !requiresPassword ? (
        <Field
          key="pin"
          label={pinMessages.optionalPin}
          name="pin"
          type="password"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          minLength={PIN_MIN_LENGTH}
          maxLength={PIN_MAX_LENGTH}
          pattern={PIN_PATTERN}
          hint={pinMessages.generateHint}
          onChange={(event) => {
            event.currentTarget.value = normalizePinInput(event.currentTarget.value);
          }}
        />
      ) : (
        <Field
          key="password"
          label={roMessages.message131}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          hint={roMessages.message132}
        />
      )}
      <Select label={roMessages.message133} name="managedByUserId">
        <option value="">{roMessages.message134}</option>
        {users
          .filter((user) => user.status !== 'DISABLED')
          .map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
          ))}
      </Select>
    </>
  );
}
