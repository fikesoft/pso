import type {
  BillPlanResolutionResponse,
  BillPartCommandIdentity,
  BillCollectionResult,
} from '@pos/contracts/bill-splits';
import type { Api } from '../../../shared/api';
import type {
  BillAttempt,
  BillOperationIdentity,
  BillOperationResult,
  BillOperationResolution,
} from '../model/bill-operation.types';
export function billAttemptIdentity(value: BillAttempt): BillOperationIdentity {
  const base = { locationId: value.body.locationId, requestKey: value.body.requestKey };
  if (value.family === 'COLLECTION')
    return { family: 'COLLECTION', command: { ...base, partId: value.partId } };
  return {
    family: 'PLAN',
    command:
      value.kind === 'CREATE'
        ? { ...base, kind: 'CREATE', context: value.body.context }
        : { ...base, kind: 'VOID', splitId: value.splitId },
  };
}
export async function sendBillAttempt(api: Api, value: BillAttempt): Promise<BillOperationResult> {
  if (value.family === 'COLLECTION')
    return {
      family: 'COLLECTION',
      result: (await api.http.post(`/bill-parts/${value.partId}/payments`, value.body)).data,
    };
  return {
    family: 'PLAN',
    result: (
      await api.http.post(
        value.kind === 'CREATE' ? '/bill-splits' : `/bill-splits/${value.splitId}/void`,
        value.body,
      )
    ).data,
  };
}
export async function resolveBillOperation(
  api: Api,
  identity: BillOperationIdentity,
): Promise<BillOperationResolution> {
  if (identity.family === 'PLAN') {
    const response = (
      await api.http.post<BillPlanResolutionResponse>(
        '/bill-plan-commands/resolution',
        identity.command,
      )
    ).data;
    const command: BillOperationIdentity = { family: 'PLAN', command: response.command };
    return response.status === 'SUCCEEDED'
      ? { status: response.status, command, result: { family: 'PLAN', result: response.result } }
      : { status: response.status, command };
  }
  const { partId, ...body } = identity.command;
  const response = (
    await api.http.post<{
      status: 'SUCCEEDED' | 'RETIRED';
      command: BillPartCommandIdentity;
      result?: { collection: BillCollectionResult };
    }>(`/bill-parts/${partId}/payment-commands/resolution`, body)
  ).data;
  const command: BillOperationIdentity = { family: 'COLLECTION', command: response.command };
  return response.status === 'SUCCEEDED'
    ? {
        status: response.status,
        command,
        result: { family: 'COLLECTION', result: response.result! },
      }
    : { status: response.status, command };
}
