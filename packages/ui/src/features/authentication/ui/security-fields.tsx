import { Button, Field } from '../../../shared/ui';
import { roMessages } from '../../../shared/i18n';
import { MINIMUM_PASSWORD_LENGTH, MFA_CODE_LENGTH } from '../config/authentication.constants';
import type { SecurityFieldsProps } from '../model/authentication.types';
export function SecurityFields({ stage, auth }: SecurityFieldsProps) {
  const { secret, enrollmentUri, busy, enroll } = auth;
  return (
    <>
      {stage === 'password' && (
        <>
          <Field
            label={roMessages.message413}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <Field
            label={roMessages.message414}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={MINIMUM_PASSWORD_LENGTH}
            required
            hint={roMessages.message415}
          />
        </>
      )}
      {stage === 'enroll' && (
        <>
          {!secret ? (
            <Button type="button" variant="secondary" busy={busy} onClick={() => void enroll()}>
              {roMessages.message416}
            </Button>
          ) : (
            <div className="enrollment">
              <strong>{roMessages.message417}</strong>
              <code aria-label={roMessages.message418}>{secret}</code>
              <p>{roMessages.message419}</p>
              <a href={enrollmentUri}>{roMessages.message420}</a>
            </div>
          )}
        </>
      )}
      {(stage === 'mfa' || (stage === 'enroll' && secret)) && (
        <Field
          label={roMessages.message421}
          name="code"
          placeholder="000000"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={MFA_CODE_LENGTH}
          required
        />
      )}
    </>
  );
}
