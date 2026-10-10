import type {
  DiningTableListRequest,
  DiningTableListResponse,
  TableMapQueryRequest,
  TableMapResponse,
  DiningTableCreateRequest,
  DiningTableUpdateRequest,
  DiningTableArchiveRequest,
  DiningTableMutationResponse,
  DiningTableCommandIdentity,
  DiningTableResolutionResponse,
} from '@pos/contracts/tables';
import type { Api } from '../../../shared/api';
export async function readDiningTables(api: Api, params: DiningTableListRequest) {
  return (await api.http.get<DiningTableListResponse>('/dining-tables', { params })).data;
}
export async function readTableMap(api: Api, params: TableMapQueryRequest) {
  return (await api.http.get<TableMapResponse>('/table-map', { params })).data;
}
export async function createDiningTable(api: Api, body: DiningTableCreateRequest) {
  return (await api.http.post<DiningTableMutationResponse>('/dining-tables', body)).data;
}
export async function updateDiningTable(api: Api, id: string, body: DiningTableUpdateRequest) {
  return (await api.http.patch<DiningTableMutationResponse>(`/dining-tables/${id}`, body)).data;
}
export async function archiveDiningTable(api: Api, id: string, body: DiningTableArchiveRequest) {
  return (await api.http.post<DiningTableMutationResponse>(`/dining-tables/${id}/archive`, body))
    .data;
}
export async function resolveDiningTable(api: Api, command: DiningTableCommandIdentity) {
  return (
    await api.http.post<DiningTableResolutionResponse>('/dining-table-commands/resolution', command)
  ).data;
}
