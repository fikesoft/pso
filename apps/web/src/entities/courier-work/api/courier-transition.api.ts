import {
  deliveryOperationRecordSchema,
  deliveryResolutionResponseSchema,
} from '@pos/contracts/delivery';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { Api } from '../../../shared/api';
import type { TransitionAttempt, TransitionRecovery } from '../model/courier-work.types';
export async function sendTransition(api: Api, actor: string, attempt: TransitionAttempt) {
  const { data } = await api.http.post(`/orders/${attempt.orderId}/delivery`, attempt.body);
  const operation = deliveryOperationRecordSchema.parse(data.operation);
  if (
    data.order?.id !== attempt.orderId ||
    data.order?.locationId !== attempt.locationId ||
    operation.actorUserId !== actor ||
    operation.toStatus !== attempt.body.status ||
    operation.orderVersion !== attempt.body.version + 1
  )
    throw new Error(text.invalidResponse);
  return operation;
}
export async function resolveTransition(api: Api, actor: string, attempt: TransitionRecovery) {
  const { data } = await api.http.post(
    `/orders/${attempt.orderId}/delivery/resolution`,
    attempt.body,
  );
  const parsed = deliveryResolutionResponseSchema.parse(data);
  if (
    parsed.orderId !== attempt.orderId ||
    parsed.locationId !== attempt.body.locationId ||
    parsed.requestKey !== attempt.body.requestKey ||
    (parsed.status === 'SUCCEEDED'
      ? parsed.operation.actorUserId !== actor || parsed.operation.toStatus !== attempt.body.status
      : parsed.toStatus !== attempt.body.status)
  )
    throw new Error(text.invalidResponse);
  return parsed;
}
