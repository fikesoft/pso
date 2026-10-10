import { roMessages, Select } from '@pos/ui';
import type { ScopeType } from '@pos/ui/types';
import type { ScopeFieldsProps } from '../model/scope-fields.types';
export function ScopeFields({
  locations,
  scope,
  setScope,
  locationId,
  setLocationId,
}: ScopeFieldsProps) {
  return (
    <div>
      <div className="form-grid">
        <Select
          label={roMessages.message079}
          value={scope}
          onChange={(e) => setScope(e.target.value as ScopeType)}
        >
          <option value="LOCATION">{roMessages.message080}</option>
          <option value="ORGANIZATION">{roMessages.message081}</option>
        </Select>
        {scope === 'LOCATION' && (
          <Select
            label={roMessages.message082}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            required
          >
            <option value="">{roMessages.message083}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="scope-hint">
        {scope === 'LOCATION' ? roMessages.message084 : roMessages.message085}
      </p>
    </div>
  );
}
