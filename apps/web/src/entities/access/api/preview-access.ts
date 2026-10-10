import type { PreviewAccessRequest } from '../model/preview-request.types';
import type { AccessEntry } from '@pos/ui/types';
import type { Api } from '../../../shared/api';
export async function previewAccess(api: Api, payload: PreviewAccessRequest) {
  const { data } = await api.http.post<{ entries: AccessEntry[] }>('/access/preview', payload);
  return data;
}
