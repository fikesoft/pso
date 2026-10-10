import type { Prisma } from '@pos/db';
import { businessHoursSchema } from '@pos/contracts';

export function publicLocation(location: Prisma.LocationGetPayload<Record<string, never>>) {
  return {
    ...location,
    latitude: location.latitude?.toString() ?? null,
    longitude: location.longitude?.toString() ?? null,
    businessHours: businessHoursSchema.parse(location.businessHours),
  };
}
