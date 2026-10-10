import type { Api } from '../../../shared/api';
import { setKitchenRouting, resolveKitchenRouting } from '../api/routing.api';
import {
  createKitchenStation,
  updateKitchenStation,
  archiveKitchenStation,
  resolveKitchenStation,
} from '../api/station.api';
import type {
  StationAttempt,
  StationOperationIdentity,
  StationOperationResult,
} from '../model/station-operation.types';
export function stationAttemptIdentity(value: StationAttempt): StationOperationIdentity {
  const base = { locationId: value.body.locationId, requestKey: value.body.requestKey };
  if (value.family === 'ROUTING')
    return { family: 'ROUTING', command: { ...base, productId: value.body.productId } };
  return {
    family: 'STATION',
    command:
      value.kind === 'CREATE'
        ? { ...base, kind: value.kind }
        : { ...base, kind: value.kind, stationId: value.stationId },
  };
}
export async function sendStationAttempt(
  api: Api,
  value: StationAttempt,
): Promise<StationOperationResult> {
  if (value.family === 'ROUTING')
    return { family: 'ROUTING', result: await setKitchenRouting(api, value.body) };
  return {
    family: 'STATION',
    result:
      value.kind === 'CREATE'
        ? await createKitchenStation(api, value.body)
        : value.kind === 'UPDATE'
          ? await updateKitchenStation(api, value.stationId, value.body)
          : await archiveKitchenStation(api, value.stationId, value.body),
  };
}
export function resolveStationOperation(api: Api, identity: StationOperationIdentity) {
  if (identity.family === 'ROUTING') return resolveKitchenRouting(api, identity.command);
  return resolveKitchenStation(api, identity.command);
}
