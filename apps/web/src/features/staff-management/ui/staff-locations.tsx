import { roMessages, Badge } from '@pos/ui';
import type { StaffLocationsProps } from '../model/staff-locations.types';
export function StaffLocations({ locations, selected, onChange }: StaffLocationsProps) {
  return (
    <div>
      <h3 className="section-subtitle">{roMessages.message138}</h3>
      <div className="check-options">
        {locations.map((location) => (
          <label className="check-option" key={location.id}>
            <input
              type="checkbox"
              checked={selected.includes(location.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, location.id]
                    : selected.filter((id) => id !== location.id),
                )
              }
            />
            {location.name}
            <Badge>{location.code}</Badge>
          </label>
        ))}
      </div>
      {!locations.length && <p className="text-small">{roMessages.message139}</p>}
    </div>
  );
}
