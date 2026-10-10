import type { DeliveryCoordinate } from './delivery-geometry.types';
import { DELIVERY_ZONE_LIMITS as limits } from './config/delivery-zones.constants';

function cross(a: DeliveryCoordinate, b: DeliveryCoordinate, c: DeliveryCoordinate) {
  return (
    (b.longitude - a.longitude) * (c.latitude - a.latitude) -
    (b.latitude - a.latitude) * (c.longitude - a.longitude)
  );
}
function onSegment(a: DeliveryCoordinate, b: DeliveryCoordinate, p: DeliveryCoordinate) {
  return (
    Math.abs(cross(a, b, p)) <= limits.coordinateEpsilon &&
    p.longitude >= Math.min(a.longitude, b.longitude) - limits.coordinateEpsilon &&
    p.longitude <= Math.max(a.longitude, b.longitude) + limits.coordinateEpsilon &&
    p.latitude >= Math.min(a.latitude, b.latitude) - limits.coordinateEpsilon &&
    p.latitude <= Math.max(a.latitude, b.latitude) + limits.coordinateEpsilon
  );
}
function intersects(
  a: DeliveryCoordinate,
  b: DeliveryCoordinate,
  c: DeliveryCoordinate,
  d: DeliveryCoordinate,
) {
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (
    (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
      ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
export function isSimpleDeliveryPolygon(points: DeliveryCoordinate[]) {
  if (points.length < 3 || points.length > limits.maxVertices) return false;
  if (
    points.some(
      (p) =>
        !Number.isFinite(p.latitude) ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.latitude) > 90 ||
        Math.abs(p.longitude) > 180,
    )
  )
    return false;
  if (new Set(points.map((p) => `${p.latitude},${p.longitude}`)).size !== points.length)
    return false;
  const longitudes = points.map((p) => p.longitude);
  if (Math.max(...longitudes) - Math.min(...longitudes) >= 180) return false;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    area += a.longitude * b.latitude - b.longitude * a.latitude;
    const previous = points[(i + points.length - 1) % points.length]!;
    // Adjacent edges may meet only at their common endpoint, not fold back.
    if (onSegment(previous, a, b) || onSegment(a, b, previous)) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j]!, points[(j + 1) % points.length]!)) return false;
    }
  }
  return Math.abs(area) > limits.coordinateEpsilon;
}
export function deliveryPolygonContains(points: DeliveryCoordinate[], point: DeliveryCoordinate) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]!,
      b = points[i]!;
    if (onSegment(a, b, point)) return true;
    if (
      a.latitude > point.latitude !== b.latitude > point.latitude &&
      point.longitude <
        ((b.longitude - a.longitude) * (point.latitude - a.latitude)) / (b.latitude - a.latitude) +
          a.longitude
    )
      inside = !inside;
  }
  return inside;
}
export function deliveryDistanceMeters(a: DeliveryCoordinate, b: DeliveryCoordinate) {
  const radians = Math.PI / 180;
  const latitude = (b.latitude - a.latitude) * radians;
  const longitude = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitude / 2) ** 2;
  return 2 * limits.earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
