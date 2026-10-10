import { useState } from 'react';
import type { CourierProfile } from '@pos/contracts';
import {
  courierCommandSchema,
  COURIER_AVAILABILITY,
  COURIER_VEHICLES,
  COURIER_LIMITS,
} from '@pos/contracts/couriers';
import { Button, Field, Notice, Select } from '@pos/ui';
import { courierMessages as text } from '@pos/ui/locales';
import type { CourierFormProps } from '../model/courier.types';
import { useCourierCandidates } from '../model/use-courier-candidates';
import { DEFAULT_COURIER_PROFILE } from '../config/couriers.constants';
import { CourierCandidates } from './courier-candidates';
import { CourierRecovery } from './courier-recovery';
export function CourierForm({ api, edit, locationId, command, onClose }: CourierFormProps) {
  const [profile, setProfile] = useState<CourierProfile>(
    edit.action === 'CREATE' ? { ...DEFAULT_COURIER_PROFILE } : edit.courier.profile,
  );
  const [userId, setUserId] = useState(''),
    [availability, setAvailability] = useState<string>(
      edit.action === 'CREATE' ? 'OFFLINE' : edit.courier.availability,
    );
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const editable = edit.action === 'CREATE' || edit.action === 'UPDATE';
  const stateChange = edit.action === 'ARCHIVE' || edit.action === 'RESTORE';
  const candidates = useCourierCandidates(api, locationId, edit.action === 'CREATE');
  const blocked =
    command.locked || (edit.action === 'CREATE' && (candidates.loading || !!candidates.error));
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked || (stateChange && !confirmed)) return;
        const parsed = courierCommandSchema.safeParse({
          action: edit.action,
          locationId,
          requestKey: crypto.randomUUID(),
          ...(edit.action === 'CREATE' ? { userId } : { version: edit.courier.version }),
          ...(editable ? { profile } : {}),
          ...(edit.action === 'SET_AVAILABILITY' ? { availability } : {}),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]!.message);
          return;
        }
        setError('');
        void command.send({
          courierId: edit.action === 'CREATE' ? edit.courierId : edit.courier.id,
          body: parsed.data,
        });
      }}
    >
      {edit.action === 'CREATE' && (
        <CourierCandidates
          data={candidates.data ?? null}
          loading={candidates.loading}
          error={candidates.error}
          value={userId}
          onChange={setUserId}
          more={candidates.more}
          disabled={command.locked}
        />
      )}
      {edit.action !== 'CREATE' && <strong>{edit.courier.displayName}</strong>}
      {editable && (
        <>
          <p>{text.profileHint}</p>
          <Select
            label={text.vehicle}
            value={profile.vehicle}
            disabled={blocked}
            onChange={(event) =>
              setProfile({ ...profile, vehicle: event.target.value as CourierProfile['vehicle'] })
            }
          >
            {COURIER_VEHICLES.map((value) => (
              <option key={value} value={value}>
                {text.vehicles[value]}
              </option>
            ))}
          </Select>
          <Field
            label={text.capacity}
            type="number"
            min={1}
            max={COURIER_LIMITS.capacity}
            step={1}
            required
            disabled={blocked}
            value={Number.isFinite(profile.capacity) ? profile.capacity : ''}
            onChange={(event) => setProfile({ ...profile, capacity: event.target.valueAsNumber })}
          />
        </>
      )}
      {edit.action === 'SET_AVAILABILITY' && (
        <>
          <p>{text.availabilityHint}</p>
          <Select
            label={text.availability}
            value={availability}
            disabled={blocked}
            onChange={(event) => setAvailability(event.target.value)}
          >
            {COURIER_AVAILABILITY.map((value) => (
              <option key={value} value={value}>
                {text.statuses[value]}
              </option>
            ))}
          </Select>
        </>
      )}
      {stateChange && (
        <>
          <p>{edit.action === 'ARCHIVE' ? text.archiveHint : text.restoreHint}</p>
          <label className="inline">
            <input
              type="checkbox"
              required
              disabled={blocked}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {text.confirm}
          </label>
        </>
      )}
      {(error || command.error) && <Notice>{error || command.error}</Notice>}
      <CourierRecovery command={command} />
      {command.stale && <Notice>{text.stale}</Notice>}
      <div className="inline">
        <Button type="submit" disabled={blocked || (stateChange && !confirmed)} busy={command.busy}>
          {text.save}
        </Button>
        <Button type="button" variant="secondary" disabled={command.busy} onClick={onClose}>
          {text.cancel}
        </Button>
      </div>
    </form>
  );
}
