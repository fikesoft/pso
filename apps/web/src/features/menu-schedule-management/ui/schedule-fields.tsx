import { useState } from 'react';
import type { ScheduleFieldsProps } from '../model/menu-schedules.types';
import { Field, Select } from '@pos/ui';
import { menuScheduleMessages as text, operationalMessages as common } from '@pos/ui/locales';
import { SCHEDULE_WEEKDAYS } from '../config/menu-schedules.constants';
import { timeLabel } from '../model/schedule-form';

export function ScheduleFields({ schedule }: ScheduleFieldsProps) {
  const [midnight, setMidnight] = useState(schedule?.endMinute === 1440);
  return (
    <>
      <Field
        label={text.name}
        name="name"
        minLength={2}
        maxLength={100}
        required
        defaultValue={schedule?.name ?? ''}
      />
      <Field
        label={text.event}
        name="eventName"
        minLength={2}
        maxLength={100}
        defaultValue={schedule?.eventName ?? ''}
      />
      <fieldset className="operation-fields">
        <legend>{text.weekdays}</legend>
        <div className="attendance-controls">
          {SCHEDULE_WEEKDAYS.map((day) => (
            <label key={day.value}>
              <input
                type="checkbox"
                name="weekdays"
                value={day.value}
                defaultChecked={schedule ? schedule.weekdays.includes(day.value) : true}
              />{' '}
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <Field
          label={text.start}
          name="startTime"
          type="time"
          required
          defaultValue={timeLabel(schedule?.startMinute ?? 420)}
        />
        <Field
          label={text.end}
          name="endTime"
          type="time"
          required={!midnight}
          disabled={midnight}
          defaultValue={timeLabel(schedule?.endMinute === 1440 ? 0 : (schedule?.endMinute ?? 660))}
        />
      </div>
      <label>
        <input
          type="checkbox"
          name="midnight"
          checked={midnight}
          onChange={(event) => setMidnight(event.target.checked)}
        />{' '}
        {text.midnight}
      </label>
      <p className="muted">{text.overnight}</p>
      <div className="form-grid">
        <Field
          label={text.startsOn}
          name="startsOn"
          type="date"
          defaultValue={schedule?.startsOn ?? ''}
        />
        <Field
          label={text.endsOn}
          name="endsOn"
          type="date"
          defaultValue={schedule?.endsOn ?? ''}
        />
      </div>
      <p className="muted">{text.datesHint}</p>
      {schedule && (
        <>
          <Select label={common.status} name="status" defaultValue={schedule.status}>
            <option value="ACTIVE">{text.active}</option>
            <option value="ARCHIVED">{text.archive}</option>
          </Select>
          <p className="muted">{text.archiveHint}</p>
        </>
      )}
    </>
  );
}
