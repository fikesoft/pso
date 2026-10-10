import {
  courierListResponseSchema,
  courierCommandResponseSchema,
  courierResolutionResponseSchema,
  courierSchema,
  courierCandidateResponseSchema,
} from '@pos/contracts/couriers';
import type { CourierQuery } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { CourierAttempt, CourierRecovery } from '../model/courier.types';
import { courierMessages as text } from '@pos/ui/locales';
export async function readOwnCourier(api: Api, locationId: string, userId: string) {
  const { data } = await api.http.get('/couriers/me', { params: { locationId } });
  const courier = data.courier === null ? null : courierSchema.parse(data.courier);
  if (courier && (courier.locationId !== locationId || courier.userId !== userId))
    throw new Error(text.invalidResponse);
  return { couriers: courier ? [courier] : [], nextCursor: null };
}
export async function readCourierCandidates(api: Api, locationId: string, cursor?: string) {
  const { data } = await api.http.get('/couriers/candidates', {
    params: { locationId, limit: 30, ...(cursor ? { cursor } : {}) },
  });
  return courierCandidateResponseSchema.parse(data);
}
export async function readCouriers(api: Api, params: CourierQuery) {
  const { data } = await api.http.get('/couriers', { params });
  const parsed = courierListResponseSchema.parse(data);
  if (
    parsed.couriers.some(
      (courier) =>
        courier.locationId !== params.locationId ||
        (params.status !== 'ALL' && courier.status !== params.status),
    )
  )
    throw new Error(text.invalidResponse);
  return parsed;
}
export async function sendCourierCommand(api: Api, attempt: CourierAttempt) {
  const { data } = await api.http.post(`/couriers/${attempt.courierId}/commands`, attempt.body);
  const parsed = courierCommandResponseSchema.parse(data);
  if (
    parsed.result.courierId !== attempt.courierId ||
    parsed.result.locationId !== attempt.body.locationId ||
    parsed.result.requestKey !== attempt.body.requestKey ||
    parsed.result.action !== attempt.body.action
  )
    throw new Error(text.invalidResponse);
  return parsed;
}
export async function resolveCourierCommand(api: Api, attempt: CourierRecovery) {
  const { data } = await api.http.post(
    `/couriers/${attempt.courierId}/commands/resolution`,
    attempt.body,
  );
  const parsed = courierResolutionResponseSchema.parse(data);
  const result = parsed.status === 'SUCCEEDED' ? parsed.result : parsed;
  if (
    result.courierId !== attempt.courierId ||
    result.locationId !== attempt.body.locationId ||
    result.requestKey !== attempt.body.requestKey ||
    result.action !== attempt.body.action
  )
    throw new Error(text.invalidResponse);
  if (parsed.status === 'SUCCEEDED')
    courierCommandResponseSchema.parse({ result: parsed.result, courier: parsed.courier });
  return parsed;
}
