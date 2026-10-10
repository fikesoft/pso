import { createHash } from 'node:crypto';
import type { MediaPurpose } from '../../../entities/file-assets';
import { requestHash } from '../../../shared/lib/idempotency';

export function mediaRequestHash(input: {
  purpose: MediaPurpose;
  action: 'SET' | 'CLEAR';
  resourceId: string;
  version: number;
  contentType?: string;
  bytes?: Buffer;
}) {
  return requestHash({
    purpose: input.purpose,
    action: input.action,
    resourceId: input.resourceId,
    version: input.version,
    ...(input.action === 'SET'
      ? {
          contentType: input.contentType,
          bytesHash: createHash('sha256')
            .update(input.bytes ?? Buffer.alloc(0))
            .digest('hex'),
        }
      : {}),
  });
}
