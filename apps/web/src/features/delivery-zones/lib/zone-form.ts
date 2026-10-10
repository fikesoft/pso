import type { DeliveryZoneProfile } from '@pos/contracts';
import { deliveryZoneHoursSchema } from '@pos/contracts/delivery-zones';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
import { DELIVERY_ZONE_WEEKDAYS } from '../config/delivery-zone.constants';
export function emptyZoneProfile(): DeliveryZoneProfile {
  return {
    name: '',
    shape: { type: 'RADIUS', center: { latitude: NaN, longitude: NaN }, radiusMeters: 3000 },
    minimumOrder: '0.00',
    deliveryFee: '0.00',
    freeDeliveryFrom: null,
    estimatedMinutes: 45,
    activeHours: [],
    priority: 100,
  };
}
function minute(value: string) {
  const [hour, minutes] = value.split(':').map(Number);
  if (hour! > 24 || minutes! > 59 || (hour === 24 && minutes !== 0))
    throw new Error(text.invalidHours);
  return hour! * 60 + minutes!;
}
function time(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function formatZoneHours(hours: DeliveryZoneProfile['activeHours']) {
  return hours
    .map(
      (window) =>
        `${DELIVERY_ZONE_WEEKDAYS[window.weekday - 1]} ${time(window.startMinute)}-${time(window.endMinute)}`,
    )
    .join('\n');
}
export function parseZoneHours(value: string) {
  if (!value.trim()) return [];
  const windows = value
    .trim()
    .split('\n')
    .map((line) => {
      const match =
        /^(luni|marti|miercuri|joi|vineri|sambata|duminica)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(
          line.trim().toLowerCase(),
        );
      if (!match) throw new Error(text.invalidHours);
      return {
        weekday: DELIVERY_ZONE_WEEKDAYS.findIndex((day) => day === match[1]) + 1,
        startMinute: minute(match[2]!),
        endMinute: minute(match[3]!),
      };
    });
  const parsed = deliveryZoneHoursSchema.safeParse(windows);
  if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
  return parsed.data;
}
