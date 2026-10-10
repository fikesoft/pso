import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  StationOperationIdentity,
  StationOperationResult,
} from '../model/station-operation.types';
export function validateStationResult(
  identity: StationOperationIdentity,
  value: StationOperationResult,
) {
  if (value.family === 'ROUTING' && identity.family === 'ROUTING') {
    const routing = value.result.routing;
    if (
      routing.locationId === identity.command.locationId &&
      routing.productId === identity.command.productId &&
      Number.isInteger(routing.version) &&
      routing.version > 0
    )
      return;
    throw new Error(text.invalid);
  }
  if (value.family !== 'STATION' || identity.family !== 'STATION') throw new Error(text.invalid);
  const station = value.result.station;
  if (
    value.family === 'STATION' &&
    station.locationId === identity.command.locationId &&
    (identity.command.kind === 'CREATE'
      ? station.version === 1
      : station.id === identity.command.stationId) &&
    station.status === (identity.command.kind === 'ARCHIVE' ? 'ARCHIVED' : 'ACTIVE')
  )
    return;
  throw new Error(text.invalid);
}
