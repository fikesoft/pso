import type { MediaMutationResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { MediaMutation } from '../model/media.types';

export async function mutateMedia(api: Api, mutation: MediaMutation) {
  const { resource, requestKey } = mutation;
  const path =
    resource.kind === 'employee'
      ? `/staff/${resource.id}/avatar`
      : `/catalog/products/${resource.id}/image`;
  const version = resource.version;
  if (mutation.action === 'CLEAR')
    return (await api.http.post<MediaMutationResponse>(`${path}/clear`, { version, requestKey }))
      .data;
  return (
    await api.http.put<MediaMutationResponse>(path, mutation.file, {
      params: { version, requestKey },
      headers: { 'Content-Type': mutation.file.type },
    })
  ).data;
}
