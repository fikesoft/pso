import { normalizePinInput } from '../../../shared/lib/pin-format';
import { useAuthLifecycle } from './use-auth-lifecycle';
import { enrollAuthenticator } from '../api/authentication.api';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createApi, errorMessage } from '../../../shared/api/client';
import type { Session, AuthenticationMethod } from '../../../shared/api/types';
import type { AuthOptions, AuthController } from './authentication.types';
export function useAuthentication({ plane, companySlug }: AuthOptions): AuthController {
  const lifecycle = useAuthLifecycle();
  const [api] = useState(() => createApi(plane));
  const [loginMethod, updateLoginMethod] = useState<AuthenticationMethod>(
    plane === 'tenant' ? 'PIN' : 'PASSWORD',
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [enrollmentUri, setEnrollmentUri] = useState('');
  const refresh = useCallback(
    async (invalidate = false) => {
      const revision = lifecycle.beginRead();
      if (revision === null) return;
      setError('');
      if (invalidate) {
        setSession(null);
        setLoading(true);
        setSecret('');
        setEnrollmentUri('');
      }
      try {
        const next = await api.session();
        if (lifecycle.isCurrent(revision)) setSession(next);
      } catch (error) {
        if (lifecycle.isCurrent(revision)) setError(errorMessage(error));
      } finally {
        if (lifecycle.isCurrent(revision)) setLoading(false);
      }
    },
    [api, lifecycle],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const interceptor = api.http.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/'))
          await refresh(true);
        return Promise.reject(error);
      },
    );
    return () => api.http.interceptors.response.eject(interceptor);
  }, [api, refresh]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const revision = lifecycle.beginAction();
    if (revision === null) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      let next: Session;
      if (!session?.user && plane === 'tenant' && loginMethod === 'PIN')
        next = await api.auth('pin', {
          companySlug: companySlug || form.get('companySlug'),
          pin: normalizePinInput(String(form.get('pin') || '').trim()),
        });
      else if (!session?.user)
        next = await api.auth('login', {
          login: form.get('login'),
          password: form.get('password'),
          ...(plane === 'tenant' ? { companySlug: companySlug || form.get('companySlug') } : {}),
        });
      else if (session.stage === 'password')
        next = await api.auth('password', {
          currentPassword: form.get('currentPassword'),
          newPassword: form.get('newPassword'),
        });
      else next = await api.auth('mfa/verify', { code: form.get('code') });
      const current = next.user ? next : await api.session();
      if (lifecycle.isCurrent(revision)) {
        setSecret('');
        setEnrollmentUri('');
        setSession(current);
      }
    } catch (error) {
      if (lifecycle.isCurrent(revision)) setError(errorMessage(error));
    } finally {
      if (lifecycle.isCurrent(revision)) setBusy(false);
      lifecycle.finishAction(revision);
    }
  }
  async function enroll() {
    const revision = lifecycle.beginAction();
    if (revision === null) return;
    setBusy(true);
    setError('');
    try {
      const data = await enrollAuthenticator(api);
      if (lifecycle.isCurrent(revision)) {
        setSecret(data.secret);
        setEnrollmentUri(data.otpauthUri);
      }
    } catch (error) {
      if (lifecycle.isCurrent(revision)) setError(errorMessage(error));
    } finally {
      if (lifecycle.isCurrent(revision)) setBusy(false);
      lifecycle.finishAction(revision);
    }
  }
  async function logout() {
    const revision = lifecycle.beginAction();
    if (revision === null) return;
    setBusy(true);
    setError('');
    try {
      const next = await api.auth('logout');
      if (lifecycle.isCurrent(revision)) {
        setSession(next);
        setSecret('');
        setEnrollmentUri('');
      }
    } catch (error) {
      if (lifecycle.isCurrent(revision)) setError(errorMessage(error));
    } finally {
      if (lifecycle.isCurrent(revision)) setBusy(false);
      lifecycle.finishAction(revision);
    }
  }
  function invalidateRevoked() {
    const revision = lifecycle.invalidate();
    setSession(null);
    setSecret('');
    setEnrollmentUri('');
    setError('');
    setBusy(true);
    void api
      .auth('logout')
      .catch(() => {
        // The session is already revoked on the server; cookie cleanup is best effort.
      })
      .finally(() => {
        if (lifecycle.isCurrent(revision)) setBusy(false);
        lifecycle.finishAction(revision);
      });
  }
  function setLoginMethod(method: AuthenticationMethod) {
    if (busy || plane === 'platform') return;
    updateLoginMethod(method);
    setError('');
  }
  return {
    api,
    session,
    loading,
    busy,
    loginMethod,
    setLoginMethod,
    error,
    secret,
    enrollmentUri,
    submit,
    enroll,
    logout,
    invalidateRevoked,
  };
}
