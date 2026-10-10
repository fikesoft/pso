import axios from 'axios';
import { HTTP_TIMEOUT_MS } from '../config/http.constants';
import { ro } from '../i18n/ro';
import type { Session } from './types';

export function createApi(plane: 'tenant' | 'platform') {
  let csrfToken = '';
  let sessionRevision = 0;
  let pendingSession: Promise<Session> | undefined;
  const http = axios.create({
    baseURL: `/api/${plane}`,
    timeout: HTTP_TIMEOUT_MS,
    withCredentials: true,
  });
  http.interceptors.request.use((config) => {
    if (config.method && config.method !== 'get' && config.method !== 'head')
      config.headers.set('X-CSRF-Token', csrfToken);
    return config;
  });
  return {
    http,
    session() {
      if (pendingSession) return pendingSession;
      const revision = sessionRevision;
      const request = http.get<Session>('/auth/session').then(({ data }) => {
        if (revision === sessionRevision) csrfToken = data.csrfToken;
        return data;
      });
      pendingSession = request;
      void request.then(
        () => {
          if (pendingSession === request) pendingSession = undefined;
        },
        () => {
          if (pendingSession === request) pendingSession = undefined;
        },
      );
      return request;
    },
    async auth(path: string, body: object = {}) {
      const revision = ++sessionRevision;
      pendingSession = undefined;
      const { data } = await http.post<Session>(`/auth/${path}`, body);
      if (revision === sessionRevision && data.csrfToken) csrfToken = data.csrfToken;
      return data;
    },
  };
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return ro.errors.connection;
    if (error.response.status === 403) return error.response.data?.error || ro.errors.forbidden;
    if (error.response.status === 409) return error.response.data?.error || ro.errors.stale;
    return error.response.data?.error || ro.errors.request;
  }
  return error instanceof Error ? error.message : ro.errors.unknown;
}
