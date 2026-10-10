import type { Api } from '../../../shared/api';
import type { CreateLocationRequest, UpdateLocationRequest } from '../model/location-request.types';
export function updateLocation(api: Api, locationId: string, payload: UpdateLocationRequest) {
  return api.http.patch(`/locations/${locationId}`, payload);
}
export function createLocation(api: Api, payload: CreateLocationRequest) {
  return api.http.post('/locations', payload);
}
