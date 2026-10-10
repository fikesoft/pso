import { Button } from '../../../shared/ui';
import { pinMessages } from '../../../shared/i18n';
import type { LoginFieldsProps } from '../model/authentication.types';
export function LoginMethod({ plane, auth }: LoginFieldsProps) {
  if (plane === 'platform') return null;
  return (
    <div className="auth-method-switch" role="group" aria-label={pinMessages.loginMode}>
      <Button
        type="button"
        variant={auth.loginMethod === 'PIN' ? 'primary' : 'secondary'}
        aria-pressed={auth.loginMethod === 'PIN'}
        disabled={auth.busy}
        onClick={() => auth.setLoginMethod('PIN')}
      >
        {pinMessages.workerMode}
      </Button>
      <Button
        type="button"
        variant={auth.loginMethod === 'PASSWORD' ? 'primary' : 'secondary'}
        aria-pressed={auth.loginMethod === 'PASSWORD'}
        disabled={auth.busy}
        onClick={() => auth.setLoginMethod('PASSWORD')}
      >
        {pinMessages.administratorMode}
      </Button>
    </div>
  );
}
