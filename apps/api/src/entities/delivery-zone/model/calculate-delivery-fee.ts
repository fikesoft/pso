import {
  deliveryDistanceMeters,
  deliveryPolygonContains,
  deliveryCoordinateSchema,
  deliveryZoneProfileSchema,
  moneySchema,
} from '@pos/contracts';
import type { DeliveryZoneProfile } from '@pos/contracts';
import {
  DELIVERY_WEEKDAY_NUMBERS,
  DELIVERY_RADIUS_BOUNDARY_TOLERANCE_METERS,
} from '../config/delivery-fee.constants';
import type { DeliveryFeeCalculation, DeliveryFeeInput } from './delivery-fee.types';
function localClock(asOf: Date, timezone: string) {
  if (!Number.isFinite(asOf.getTime())) throw new Error('Momentul tarifului nu este valid.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(asOf);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return {
    weekday: DELIVERY_WEEKDAY_NUMBERS[part('weekday')]!,
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}
function isOpen(profile: DeliveryZoneProfile, clock: ReturnType<typeof localClock>) {
  return (
    !profile.activeHours.length ||
    profile.activeHours.some(
      (window) =>
        window.weekday === clock.weekday &&
        window.startMinute <= clock.minute &&
        clock.minute < window.endMinute,
    )
  );
}
export function calculateDeliveryFee(input: DeliveryFeeInput): DeliveryFeeCalculation {
  const subtotal = moneySchema.parse(input.subtotal),
    cents = BigInt(subtotal.replace('.', ''));
  const destination = deliveryCoordinateSchema.parse(input.destination);
  const clock = localClock(input.asOf, input.timezone);
  const covering = input.zones
    .filter((zone) => zone.status === 'ACTIVE')
    .map((zone) => ({ ...zone, profile: deliveryZoneProfileSchema.parse(zone.profile) }))
    .filter(({ profile }) =>
      profile.shape.type === 'RADIUS'
        ? deliveryDistanceMeters(profile.shape.center, destination) <=
          profile.shape.radiusMeters + DELIVERY_RADIUS_BOUNDARY_TOLERANCE_METERS
        : deliveryPolygonContains(profile.shape.vertices, destination),
    );
  if (!covering.length) return { status: 'OUTSIDE_ZONE' };
  const selected = covering
    .filter((zone) => isOpen(zone.profile, clock))
    .sort((a, b) => a.profile.priority - b.profile.priority || a.id.localeCompare(b.id))[0];
  if (!selected) return { status: 'CLOSED' };
  const profile = selected.profile;
  if (cents < BigInt(profile.minimumOrder.replace('.', '')))
    return {
      status: 'MINIMUM_NOT_MET',
      zoneId: selected.id,
      zoneVersion: selected.version,
      minimumOrder: profile.minimumOrder,
    };
  const fee =
    profile.freeDeliveryFrom !== null && cents >= BigInt(profile.freeDeliveryFrom.replace('.', ''))
      ? '0.00'
      : profile.deliveryFee;
  const totalCents = cents + BigInt(fee.replace('.', ''));
  const total = moneySchema.parse(
    `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, '0')}`,
  );
  return {
    status: 'AVAILABLE',
    zoneId: selected.id,
    zoneVersion: selected.version,
    zoneName: profile.name,
    subtotal,
    fee,
    total,
    estimatedMinutes: profile.estimatedMinutes,
  };
}
