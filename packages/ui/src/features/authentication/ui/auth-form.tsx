import { Button } from '../../../shared/ui';
import { roMessages, pinMessages } from '../../../shared/i18n';
import type { AuthFormProps } from '../model/authentication.types';
import { LoginFields } from './login-fields';
import { SecurityFields } from './security-fields';
export function AuthForm({ plane, companySlug, stage, auth }: AuthFormProps) {
  return (
    <form onSubmit={auth.submit} className="form-stack">
      {stage === 'login' && <LoginFields plane={plane} companySlug={companySlug} auth={auth} />}
      <SecurityFields stage={stage} auth={auth} />
      {(stage !== 'enroll' || auth.secret) && (
        <Button type="submit" className="full-width" busy={auth.busy}>
          {stage === 'login'
            ? plane === 'tenant' && auth.loginMethod === 'PIN'
              ? pinMessages.loginAction
              : roMessages.message350
            : stage === 'password'
              ? roMessages.message422
              : roMessages.message423}
        </Button>
      )}
    </form>
  );
}
