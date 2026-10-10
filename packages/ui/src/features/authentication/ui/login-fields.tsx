import { PIN_MIN_LENGTH, PIN_MAX_LENGTH, PIN_PATTERN } from '@pos/contracts/pin';
import { normalizePinInput } from '../../../shared/lib/pin-format';
import { Field } from '../../../shared/ui';
import { roMessages, pinMessages } from '../../../shared/i18n';
import type { LoginFieldsProps } from '../model/authentication.types';
import { LoginMethod } from './login-method';
export function LoginFields({ plane, companySlug, auth }: LoginFieldsProps) {
  return (
    <>
      <LoginMethod plane={plane} companySlug={companySlug} auth={auth} />
      {!companySlug && plane === 'tenant' && (
        <Field
          label={roMessages.message372}
          name="companySlug"
          autoComplete="organization"
          placeholder={roMessages.message408}
          required
          pattern="[a-z0-9\-]+"
        />
      )}
      <div className="form-stack" key={auth.loginMethod}>
        {plane === 'tenant' && auth.loginMethod === 'PIN' ? (
          <Field
            label={pinMessages.pinLabel}
            name="pin"
            type="password"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            required
            minLength={PIN_MIN_LENGTH}
            maxLength={PIN_MAX_LENGTH}
            pattern={PIN_PATTERN}
            hint={pinMessages.pinHint}
            onChange={(event) => {
              event.currentTarget.value = normalizePinInput(event.currentTarget.value);
            }}
          />
        ) : (
          <>
            <Field
              label={roMessages.message409}
              name="login"
              autoComplete="username"
              placeholder={roMessages.message410}
              required
            />
            <Field
              label={roMessages.message411}
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder={roMessages.message412}
              required
            />
          </>
        )}
      </div>
    </>
  );
}
