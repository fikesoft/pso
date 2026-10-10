import {
  courierAcceptanceResponseSchema,
  courierAcceptanceResolutionResponseSchema,
} from '@pos/contracts/courier-work';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { Api } from '../../../shared/api';
import type { AcceptanceAttempt, AcceptanceRecovery } from '../model/courier-work.types';
export async function sendAcceptance(api: Api, attempt: AcceptanceAttempt) {
  const { data } = await api.http.post(`/courier-work/${attempt.orderId}/accept`, attempt.body);
  const parsed = courierAcceptanceResponseSchema.parse(data);
  const result = parsed.result;
  if (
    result.orderId !== attempt.orderId ||
    result.locationId !== attempt.body.locationId ||
    result.assignmentId !== attempt.body.assignmentId ||
    result.requestKey !== attempt.body.requestKey
  )
    throw new Error(text.invalidResponse);
  return parsed;
}
export async function resolveAcceptance(api: Api, attempt: AcceptanceRecovery) {
  const { data } = await api.http.post(
    `/courier-work/${attempt.orderId}/accept/resolution`,
    attempt.body,
  );
  const parsed = courierAcceptanceResolutionResponseSchema.parse(data);
  const result = parsed.status === 'SUCCEEDED' ? parsed.result : parsed;
  if (
    result.orderId !== attempt.orderId ||
    result.locationId !== attempt.body.locationId ||
    result.assignmentId !== attempt.body.assignmentId ||
    result.requestKey !== attempt.body.requestKey
  )
    throw new Error(text.invalidResponse);
  if (parsed.status === 'SUCCEEDED')
    courierAcceptanceResponseSchema.parse({ result: parsed.result, order: parsed.order });
  return parsed;
}
