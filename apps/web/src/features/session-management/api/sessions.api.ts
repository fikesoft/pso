import type { ActiveSessionsResponse, RevokeSessionResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';

export async function readSessions(api: Api, userId: string, cursor?: string) {
  const { data } = await api.http.get<ActiveSessionsResponse>('/sessions', {
    params: { userId, cursor },
  });
  return data;
}

export async function revokeSession(api: Api, id: string) {
  const { data } = await api.http.delete<RevokeSessionResponse>(`/sessions/${id}`);
  return data;
}

export async function revokeAllSessions(api: Api, userId: string) {
  const { data } = await api.http.post<RevokeSessionResponse>('/sessions/revoke-all', { userId });
  return data;
}
