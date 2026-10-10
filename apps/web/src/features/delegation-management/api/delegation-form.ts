import type { Api } from '../../../shared/api';
import type { CreateDelegationRequest } from '../model/delegation-request.types';
export function createDelegation(api: Api, payload: CreateDelegationRequest) {
  return api.http.post('/delegations', payload);
}
