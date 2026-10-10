import { useState } from 'react';
import { Field } from '@pos/ui';
import { locationMessages as text } from '@pos/ui/locales';
import type { LocationDetailsProps } from '../model/location-form.types';
import { weekdays } from '../config/weekdays.constants';

export function BusinessHoursFields({ location }: Pick<LocationDetailsProps, 'location'>) {
  const [enabled, setEnabled] = useState(
    () => location?.businessHours?.map(({ day }) => day) ?? [],
  );
  return (
    <fieldset className="form-stack">
      <legend>{text.hours}</legend>
      <p className="muted">{text.hoursHint}</p>
      {weekdays.map(({ day, label }) => {
        const hours = location?.businessHours?.find((entry) => entry.day === day);
        const active = enabled.includes(day);
        return (
          <div className="form-stack" key={day}>
            <label className="check-option">
              <input
                type="checkbox"
                name={`day-${day}`}
                checked={active}
                onChange={(event) =>
                  setEnabled(
                    event.target.checked
                      ? [...enabled, day]
                      : enabled.filter((value) => value !== day),
                  )
                }
              />{' '}
              {label}
            </label>
            {active && (
              <div className="form-grid">
                <Field
                  label={`${text.opens} · ${label}`}
                  type="time"
                  name={`opens-${day}`}
                  defaultValue={hours?.opensAt ?? '09:00'}
                  required
                />
                <Field
                  label={`${text.closes} · ${label}`}
                  type="time"
                  name={`closes-${day}`}
                  defaultValue={hours?.closesAt ?? '22:00'}
                  required
                />
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
