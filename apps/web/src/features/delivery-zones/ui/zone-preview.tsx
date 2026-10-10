import { deliveryZoneShapeSchema } from '@pos/contracts/delivery-zones';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
import type { ZoneShapeProps } from '../model/delivery-zone.types';
export function ZonePreview({ shape }: Pick<ZoneShapeProps, 'shape'>) {
  if (!deliveryZoneShapeSchema.safeParse(shape).success) return null;
  let points = '';
  if (shape.type === 'POLYGON') {
    const xs = shape.vertices.map((point) => point.longitude),
      ys = shape.vertices.map((point) => point.latitude);
    const minX = Math.min(...xs),
      maxY = Math.max(...ys);
    const scale = 140 / Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys));
    points = shape.vertices
      .map(
        (point) =>
          `${30 + (point.longitude - minX) * scale},${10 + (maxY - point.latitude) * scale}`,
      )
      .join(' ');
  }
  return (
    <figure>
      <svg viewBox="0 0 200 160" width="200" height="160" role="img" aria-label={text.preview}>
        {shape.type === 'RADIUS' ? (
          <circle cx="100" cy="80" r="65" fill="#e0f2fe" stroke="#0369a1" strokeWidth="2" />
        ) : (
          <polygon points={points} fill="#e0f2fe" stroke="#0369a1" strokeWidth="2" />
        )}
      </svg>
      <figcaption className="section-note">{text.previewHint}</figcaption>
    </figure>
  );
}
