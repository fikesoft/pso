import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button, Notice } from '../../../shared/ui';
import { roMessages, pinMessages } from '../../../shared/i18n';
import { AUTH_STAGE_MESSAGES } from '../config/authentication.constants';
import type { AuthCardProps } from '../model/authentication.types';
import { AuthForm } from './auth-form';
export function AuthCard({ plane, companySlug, stage, wrongCompany, auth }: AuthCardProps) {
  const { session, error, busy, logout } = auth;
  const messages = AUTH_STAGE_MESSAGES[stage ?? 'login'];
  return (
    <section className="auth-panel">
      <div className="auth-card">
        <div className="auth-icon">
          <LockKeyhole size={25} />
        </div>
        <div className="eyebrow">
          {plane === 'platform'
            ? roMessages.message395
            : session?.organization?.name || companySlug || roMessages.message396}
        </div>
        <h2>{wrongCompany ? roMessages.message397 : messages.title}</h2>
        <p className="muted">
          {wrongCompany
            ? roMessages.message402
            : stage === 'login' && plane === 'tenant' && auth.loginMethod === 'PIN'
              ? pinMessages.loginHint
              : messages.description}
        </p>
        {error && <Notice>{error}</Notice>}
        {wrongCompany ? (
          <Button busy={busy} onClick={() => void logout()}>
            {roMessages.message407}
          </Button>
        ) : (
          <AuthForm plane={plane} companySlug={companySlug} stage={stage} auth={auth} />
        )}
        {session?.user && !wrongCompany && (
          <Button variant="ghost" className="full-width" onClick={() => void logout()}>
            {roMessages.message424}
          </Button>
        )}
        <div className="auth-help">
          <ShieldCheck size={15} />
          {plane === 'platform' ? roMessages.message425 : roMessages.message426}
        </div>
      </div>
      <footer>
        {roMessages.message427} <span>{roMessages.message428}</span>
      </footer>
    </section>
  );
}
