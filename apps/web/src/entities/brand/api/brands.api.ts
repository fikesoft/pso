import type { Brand } from '@pos/ui/types';
import type { Api } from '../../../shared/api';

export async function readBrands(api: Api) {
  const { data } = await api.http.get<{ brands: Brand[] }>('/brands');
  return data.brands;
}
