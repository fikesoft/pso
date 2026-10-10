import type {
  PackingBoardFilter,
  PackingListResponse,
  PackingCommandResult,
  PackingCommandResolution,
  ResolvePackingCommandInput,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { PackingAttempt } from '../model/packing.types';
export async function readPacking(
  api: Api,
  locationId: string,
  status: PackingBoardFilter,
  cursor?: string,
) {
  return (
    await api.http.get<PackingListResponse>('/packing/sessions', {
      params: { locationId, status, cursor, limit: 30 },
    })
  ).data;
}
export async function sendPacking(api: Api, attempt: PackingAttempt) {
  const { sessionId, ...body } = attempt;
  return (
    await api.http.post<{ result: PackingCommandResult }>(
      `/packing/sessions/${sessionId}/commands`,
      body,
    )
  ).data;
}
export async function resolvePacking(api: Api, command: ResolvePackingCommandInput) {
  return (await api.http.post<PackingCommandResolution>('/packing/commands/resolution', command))
    .data;
}
