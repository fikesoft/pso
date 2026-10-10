import { describe, expect, it } from 'vitest';
import { createApi } from './client';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Session } from './types';

function session(csrfToken: string): Session {
  return { user: null, csrfToken };
}
function response(config: InternalAxiosRequestConfig, data: Session): AxiosResponse<Session> {
  return { data, config, status: 200, statusText: 'OK', headers: {} };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('browser session coordination', () => {
  it('shares one pending session lookup between concurrent refreshes', async () => {
    const api = createApi('tenant');
    const pending = deferred<Session>();
    let requests = 0;
    api.http.defaults.adapter = async (config) => {
      requests += 1;
      return response(config, await pending.promise);
    };
    const first = api.session();
    const second = api.session();
    pending.resolve(session('same-session'));
    expect(await first).toEqual(await second);
    expect(requests).toBe(1);
  });

  it.each(['login', 'password', 'logout'])(
    'keeps the newer CSRF token after %s wins a race with an old session response',
    async (operation) => {
      const api = createApi('tenant');
      const stale = deferred<Session>();
      const oldStarted = deferred<void>();
      const headers: unknown[] = [];
      api.http.defaults.adapter = async (config) => {
        if (config.url === '/auth/session') {
          oldStarted.resolve();
          return response(config, await stale.promise);
        }
        headers.push(config.headers.get('X-CSRF-Token'));
        return response(config, session('current-session'));
      };
      const oldSession = api.session();
      await oldStarted.promise;
      await api.auth(operation);
      stale.resolve(session('obsolete-session'));
      await oldSession;
      await api.http.post('/organizations', {});
      expect(headers.at(-1)).toBe('current-session');
    },
  );

  it('allows a session retry after a failed shared lookup', async () => {
    const api = createApi('platform');
    let requests = 0;
    api.http.defaults.adapter = async (config) => {
      if (++requests === 1) throw new Error('Synthetic offline response');
      return response(config, session('retry-session'));
    };
    await expect(api.session()).rejects.toThrow('Synthetic offline response');
    await expect(api.session()).resolves.toEqual(session('retry-session'));
    expect(requests).toBe(2);
  });
});
