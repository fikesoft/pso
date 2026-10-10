import type {
  TableVisitOpenRequest,
  TableVisitCommandRequest,
  TableVisitMutationResponse,
  TableVisitDetailResponse,
  TableVisitHistoryResponse,
  TableVisitOrdersResponse,
  TableWaiterListResponse,
  TableVisitOrderQueryRequest,
  TableVisitCommandIdentity,
  TableVisitResolutionResponse,
} from '@pos/contracts/tables';
import type { Api } from '../../../shared/api';
export async function openTableVisit(api: Api, tableId: string, body: TableVisitOpenRequest) {
  return (await api.http.post<TableVisitMutationResponse>(`/dining-tables/${tableId}/visits`, body))
    .data;
}
export async function executeTableVisit(api: Api, visitId: string, body: TableVisitCommandRequest) {
  return (
    await api.http.post<TableVisitMutationResponse>(`/table-visits/${visitId}/commands`, body)
  ).data;
}
export async function readTableVisit(api: Api, id: string, locationId: string) {
  return (
    await api.http.get<TableVisitDetailResponse>(`/table-visits/${id}`, { params: { locationId } })
  ).data;
}
export async function readVisitHistory(api: Api, id: string, locationId: string, cursor?: string) {
  return (
    await api.http.get<TableVisitHistoryResponse>(`/table-visits/${id}/events`, {
      params: { locationId, limit: 50, ...(cursor ? { cursor } : {}) },
    })
  ).data;
}
export async function readVisitOrders(api: Api, id: string, params: TableVisitOrderQueryRequest) {
  return (await api.http.get<TableVisitOrdersResponse>(`/table-visits/${id}/orders`, { params }))
    .data;
}
export async function readTableWaiters(api: Api, locationId: string, cursor?: string) {
  return (
    await api.http.get<TableWaiterListResponse>('/table-visit-waiters', {
      params: { locationId, limit: 50, ...(cursor ? { cursor } : {}) },
    })
  ).data;
}
export async function resolveTableVisit(api: Api, command: TableVisitCommandIdentity) {
  return (
    await api.http.post<TableVisitResolutionResponse>('/table-visit-commands/resolution', command)
  ).data;
}
