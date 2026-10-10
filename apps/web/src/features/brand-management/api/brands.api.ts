import type { Api } from '../../../shared/api';
import type { BrandRequest } from '../model/brand-management.types';

export function saveBrand(api: Api, id: string | undefined, payload: BrandRequest) {
  return id ? api.http.patch(`/brands/${id}`, payload) : api.http.post('/brands', payload);
}
