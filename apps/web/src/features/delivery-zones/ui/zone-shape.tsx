import { Button, Field, Select } from '@pos/ui';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
import { DELIVERY_ZONE_LIMITS } from '@pos/contracts/delivery-zones';
import type { ZoneShapeProps } from '../model/delivery-zone.types';
import { ZonePreview } from './zone-preview';
export function ZoneShape({ shape, disabled, onChange }: ZoneShapeProps) {
  const points = shape.type === 'RADIUS' ? [shape.center] : shape.vertices;
  const value = (number: number) => (Number.isFinite(number) ? number : '');
  return (
    <div className="form-stack">
      <Select
        label={text.shape}
        value={shape.type}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value === 'RADIUS'
              ? { type: 'RADIUS', center: { latitude: NaN, longitude: NaN }, radiusMeters: 3000 }
              : {
                  type: 'POLYGON',
                  vertices: Array.from({ length: 3 }, () => ({ latitude: NaN, longitude: NaN })),
                },
          )
        }
      >
        <option value="RADIUS">{text.radius}</option>
        <option value="POLYGON">{text.polygon}</option>
      </Select>
      {points.map((point, index) => (
        <fieldset key={index} disabled={disabled} className="form-stack">
          {shape.type === 'POLYGON' && (
            <legend>
              {text.vertex} {index + 1}
            </legend>
          )}
          {(['latitude', 'longitude'] as const).map((axis) => (
            <Field
              key={axis}
              type="number"
              step="any"
              min={axis === 'latitude' ? -90 : -180}
              max={axis === 'latitude' ? 90 : 180}
              required
              label={`${text[axis]}${shape.type === 'POLYGON' ? ` ${index + 1}` : ''}`}
              value={value(point[axis])}
              onChange={(event) => {
                const next = { ...point, [axis]: event.target.valueAsNumber };
                onChange(
                  shape.type === 'RADIUS'
                    ? { ...shape, center: next }
                    : { ...shape, vertices: points.map((old, i) => (i === index ? next : old)) },
                );
              }}
            />
          ))}
          {shape.type === 'POLYGON' && (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || points.length <= 3}
              onClick={() => onChange({ ...shape, vertices: points.filter((_, i) => i !== index) })}
            >
              {text.removeVertex} {index + 1}
            </Button>
          )}
        </fieldset>
      ))}
      {shape.type === 'RADIUS' ? (
        <Field
          label={text.radiusMeters}
          type="number"
          min="1"
          max={DELIVERY_ZONE_LIMITS.maxRadiusMeters}
          required
          disabled={disabled}
          value={value(shape.radiusMeters)}
          onChange={(event) => onChange({ ...shape, radiusMeters: event.target.valueAsNumber })}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || points.length >= DELIVERY_ZONE_LIMITS.maxVertices}
          onClick={() =>
            onChange({ ...shape, vertices: [...shape.vertices, { latitude: NaN, longitude: NaN }] })
          }
        >
          {text.addVertex}
        </Button>
      )}
      <ZonePreview shape={shape} />
    </div>
  );
}
