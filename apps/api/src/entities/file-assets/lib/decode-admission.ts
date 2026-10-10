import { HttpError } from '../../../shared/lib/http';
import { MEDIA_CONCURRENT_DECODES } from '../config/media.constants';

export const withDecodeSlot = (() => {
  let active = 0;
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= MEDIA_CONCURRENT_DECODES)
      throw new HttpError(429, 'Prea multe imagini sunt procesate simultan. Încercați din nou.');
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
    }
  };
})();
