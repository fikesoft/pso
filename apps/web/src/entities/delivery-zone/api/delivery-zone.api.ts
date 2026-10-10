import {
  deliveryZoneListResponseSchema,
  deliveryZoneCommandResponseSchema,
  deliveryZoneResolutionResponseSchema,
} from '@pos/contracts/delivery-zones';
import type { DeliveryZoneListQuery } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { DeliveryZoneAttempt, DeliveryZoneRecovery } from '../model/delivery-zone.types';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
export async function readDeliveryZones(api: Api, params: DeliveryZoneListQuery) {
  const { data } = await api.http.get('/delivery-zones', { params });
  const parsed = deliveryZoneListResponseSchema.parse(data);
  if (
    parsed.zones.some(
      (zone) =>
        zone.locationId !== params.locationId ||
        (params.status !== 'ALL' && zone.status !== params.status),
    )
  )
    throw new Error(text.invalidResponse);
  return parsed;
}
export async function sendDeliveryZoneCommand(api: Api, attempt: DeliveryZoneAttempt) {
  const { data } = await api.http.post(`/delivery-zones/${attempt.zoneId}/commands`, attempt.body);
  const parsed = deliveryZoneCommandResponseSchema.parse(data);
  if (
    parsed.result.zoneId !== attempt.zoneId ||
    parsed.result.locationId !== attempt.body.locationId ||
    parsed.result.requestKey !== attempt.body.requestKey ||
    parsed.result.action !== attempt.body.action
  )
    throw new Error(text.invalidResponse);
  return parsed;
}
export async function resolveDeliveryZoneCommand(api: Api, attempt: DeliveryZoneRecovery) {
  const { data } = await api.http.post(
    `/delivery-zones/${attempt.zoneId}/commands/resolution`,
    attempt.body,
  );
  const parsed = deliveryZoneResolutionResponseSchema.parse(data);
  const result = parsed.status === 'SUCCEEDED' ? parsed.result : parsed;
  if (
    result.zoneId !== attempt.zoneId ||
    result.locationId !== attempt.body.locationId ||
    result.requestKey !== attempt.body.requestKey ||
    result.action !== attempt.body.action
  )
    throw new Error(text.invalidResponse);
  if (parsed.status === 'SUCCEEDED')
    deliveryZoneCommandResponseSchema.parse({ result: parsed.result, zone: parsed.zone });
  return parsed;
}
