import { HttpError } from '../../../shared/lib/http';
import { MEDIA_CONCURRENT_UPLOADS } from '../config/media.constants';
import type { UploadReservation } from './upload-admission.types';

export const reserveUpload = (() => {
  let active = 0;
  return (): UploadReservation => {
    if (active >= MEDIA_CONCURRENT_UPLOADS)
      throw new HttpError(429, 'Prea multe încărcări simultane. Încercați din nou.');
    active += 1;
    let released = false;
    let entered = false;
    const settle = () => {
      if (released) return;
      released = true;
      active -= 1;
    };
    return {
      enter: () => {
        if (released) return false;
        entered = true;
        return true;
      },
      responseClosed: () => {
        if (!entered) settle();
      },
      settle,
    };
  };
})();
