import { roMessages, Field } from '@pos/ui';
import type { Limits } from '@pos/ui/types';
import type { PermissionPickerProps } from '../model/permission-picker.types';
export function PermissionPicker({
  catalog,
  value,
  onChange,
  scope,
  delegableOnly = false,
}: PermissionPickerProps) {
  function limits(permission: string, key: keyof Limits, raw: string) {
    onChange(
      value.map((item) =>
        item.permission !== permission
          ? item
          : { ...item, limits: { ...item.limits, [key]: raw || undefined } },
      ),
    );
  }
  return (
    <div className="permission-picker" aria-label={roMessages.message086}>
      {catalog
        .filter((p) => (!scope || p.scopeTypes.includes(scope)) && (!delegableOnly || p.delegable))
        .map((p) => {
          const selected = value.find((v) => v.permission === p.key);
          return (
            <div className="permission-option" key={p.key}>
              <input
                id={`permission-${p.key}`}
                aria-label={p.label}
                type="checkbox"
                checked={!!selected}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, { permission: p.key }]
                      : value.filter((v) => v.permission !== p.key),
                  )
                }
              />
              <label htmlFor={`permission-${p.key}`}>
                <span>{p.label}</span>
                <small>
                  {p.scopeTypes
                    .map((s) => (s === 'LOCATION' ? roMessages.message082 : roMessages.message087))
                    .join(' · ')}
                  {!p.delegable ? roMessages.message088 : ''}
                </small>
              </label>
              {selected && /refund|payment|cost/.test(p.key) && (
                <div className="limits-fields">
                  <Field
                    label={roMessages.message089}
                    inputMode="decimal"
                    value={selected.limits?.maxAmount || ''}
                    onChange={(e) => limits(p.key, 'maxAmount', e.target.value)}
                    placeholder={roMessages.message090}
                    pattern="[0-9]+([.][0-9]{1,2})?"
                  />
                  <Field
                    label={roMessages.message091}
                    inputMode="decimal"
                    value={selected.limits?.maxPercent || ''}
                    onChange={(e) => limits(p.key, 'maxPercent', e.target.value)}
                    placeholder={roMessages.message090}
                    pattern="[0-9]+([.][0-9]{1,2})?"
                  />
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
