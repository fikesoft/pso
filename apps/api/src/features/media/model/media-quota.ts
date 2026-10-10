import { MEDIA_ORGANIZATION_QUOTA_BYTES } from '../config/media.constants';
import { HttpError } from '../../../shared/lib/http';

export function assertMediaQuota(usedBytes: number, incomingBytes: number) {
  if (usedBytes + incomingBytes > MEDIA_ORGANIZATION_QUOTA_BYTES)
    throw new HttpError(
      409,
      'Spațiul de imagini al companiei este epuizat.',
      'MEDIA_QUOTA_EXCEEDED',
    );
}
