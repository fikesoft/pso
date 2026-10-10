import { idSchema } from '@pos/contracts';

export function storageKey(organizationId: string, assetId: string) {
  return `${idSchema.parse(organizationId)}/${idSchema.parse(assetId)}.webp`;
}
