'use client';
import { Loading } from '../../../shared/ui';
import { roMessages } from '../../../shared/i18n';
import { useAuthentication } from '../model/use-authentication';
import type { AuthGateProps } from '../model/authentication.types';
import { AuthCard } from './auth-card';
import { AuthStory } from './auth-story';
export function AuthGate({ plane, companySlug, children }: AuthGateProps) {
  const auth = useAuthentication({ plane, companySlug });
  const { session, api, logout, invalidateRevoked } = auth;
  if (auth.loading)
    return (
      <div className="auth-loading">
        <Loading label={roMessages.message380} />
      </div>
    );
  const wrongCompany = !!(
    session?.user &&
    session.stage === 'ready' &&
    companySlug &&
    session.organization?.slug !== companySlug
  );
  if (session?.user && session.stage === 'ready' && !wrongCompany)
    return children(session, api, logout, invalidateRevoked);
  return (
    <main className="auth-page">
      <AuthStory plane={plane} />
      <AuthCard
        plane={plane}
        companySlug={companySlug}
        stage={session?.user ? session.stage : 'login'}
        wrongCompany={wrongCompany}
        auth={auth}
      />
    </main>
  );
}
