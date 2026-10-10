import type {
  CreateWebsiteConnectionRequest,
  CreateWebsiteKeyRequest,
  CreateWebsiteKeyResponse,
  UpdateWebsiteConnectionRequest,
  WebsiteConnectionResponse,
  WebsiteConnectionsResponse,
  WebsiteInboxResponse,
  WebsiteKeyResponse,
  WebsiteOrderDecisionResponse,
  WebsiteOrderResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { WebsiteDecisionAttempt, WebsiteStatusFilter } from '../model/website-delivery.types';

export async function readConnections(api: Api) {
  return (await api.http.get<WebsiteConnectionsResponse>('/website/connections')).data;
}
export async function createConnection(api: Api, input: CreateWebsiteConnectionRequest) {
  return (await api.http.post<WebsiteConnectionResponse>('/website/connections', input)).data;
}
export async function updateConnection(
  api: Api,
  id: string,
  input: UpdateWebsiteConnectionRequest,
) {
  return (await api.http.patch<WebsiteConnectionResponse>(`/website/connections/${id}`, input))
    .data;
}
export async function createKey(api: Api, id: string, input: CreateWebsiteKeyRequest) {
  return (await api.http.post<CreateWebsiteKeyResponse>(`/website/connections/${id}/keys`, input))
    .data;
}
export async function revokeKey(api: Api, id: string) {
  return (await api.http.delete<WebsiteKeyResponse>(`/website/keys/${id}`)).data;
}
export async function readInbox(
  api: Api,
  locationId: string,
  status: WebsiteStatusFilter,
  cursor?: string,
) {
  return (
    await api.http.get<WebsiteInboxResponse>('/website/orders', {
      params: { locationId, status: status || undefined, cursor },
    })
  ).data;
}
export async function readWebsiteOrder(api: Api, id: string) {
  return (await api.http.get<WebsiteOrderResponse>(`/website/orders/${id}`)).data.websiteOrder;
}
export async function decideWebsiteOrder(api: Api, id: string, attempt: WebsiteDecisionAttempt) {
  const body =
    attempt.kind === 'accept'
      ? { version: attempt.version }
      : { version: attempt.version, reason: attempt.reason };
  return (
    await api.http.post<WebsiteOrderDecisionResponse>(`/website/orders/${id}/${attempt.kind}`, body)
  ).data.websiteOrder;
}
