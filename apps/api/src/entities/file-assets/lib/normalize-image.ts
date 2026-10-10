import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { HttpError } from '../../../shared/lib/http';
import {
  MEDIA_INPUT_BYTES,
  MEDIA_INPUT_PIXELS,
  MEDIA_DECODE_SECONDS,
  MEDIA_INPUT_TYPES,
  MEDIA_MAX_DIMENSION,
  MEDIA_OUTPUT_BYTES,
} from '../config/media.constants';
import type { MediaPurpose, NormalizedImage } from '../model/media.types';
import { withDecodeSlot } from './decode-admission';

export async function normalizeImage(
  bytes: Buffer,
  contentType: string | undefined,
  purpose: MediaPurpose,
): Promise<NormalizedImage> {
  const expected = MEDIA_INPUT_TYPES[contentType as keyof typeof MEDIA_INPUT_TYPES];
  if (!expected || bytes.length === 0)
    throw new HttpError(415, 'Alegeți o imagine PNG, JPEG sau WebP.');
  if (bytes.length > MEDIA_INPUT_BYTES)
    throw new HttpError(413, 'Imaginea depășește limita de 4 MiB.');
  return withDecodeSlot(async () => {
    try {
      const input = sharp(bytes, {
        limitInputPixels: MEDIA_INPUT_PIXELS,
        animated: false,
        failOn: 'error',
      }).timeout({ seconds: MEDIA_DECODE_SECONDS });
      const metadata = await input.metadata();
      if (
        metadata.format !== expected ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > MEDIA_INPUT_PIXELS ||
        (metadata.pages ?? 1) !== 1
      )
        throw new HttpError(415, 'Imaginea nu este validă sau conține animație.');
      const output = await input
        .rotate()
        .resize({
          width: MEDIA_MAX_DIMENSION[purpose],
          height: MEDIA_MAX_DIMENSION[purpose],
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
      if (output.data.length > MEDIA_OUTPUT_BYTES)
        throw new HttpError(413, 'Imaginea procesată depășește limita de 2 MiB.');
      return {
        bytes: output.data,
        checksum: createHash('sha256').update(output.data).digest('hex'),
        width: output.info.width,
        height: output.info.height,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(415, 'Fișierul nu poate fi decodat ca imagine validă.');
    }
  });
}
