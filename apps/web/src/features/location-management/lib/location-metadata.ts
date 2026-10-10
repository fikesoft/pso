import { formText } from '../../../shared/lib';
import { weekdays } from '../config/weekdays.constants';
import type { LocationMetadataRequest } from '../model/location-request.types';

export function locationMetadata(form: FormData): LocationMetadataRequest {
  return {
    brandId: formText(form, 'brandId') || null,
    address: formText(form, 'address'),
    timezone: formText(form, 'timezone'),
    phone: formText(form, 'phone') || null,
    latitude: formText(form, 'latitude') || null,
    longitude: formText(form, 'longitude') || null,
    businessHours: weekdays
      .filter(({ day }) => form.has(`day-${day}`))
      .map(({ day }) => ({
        day,
        opensAt: formText(form, `opens-${day}`),
        closesAt: formText(form, `closes-${day}`),
      })),
  };
}
