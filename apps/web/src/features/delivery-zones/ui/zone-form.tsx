import { ZonePricingFields } from './zone-pricing-fields';
import { useId, useState } from 'react';
import { Button, Field, Notice } from '@pos/ui';
import { deliveryZoneCommandSchema } from '@pos/contracts/delivery-zones';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
import type { ZoneFormProps } from '../model/delivery-zone.types';
import { emptyZoneProfile, formatZoneHours, parseZoneHours } from '../lib/zone-form';
import { ZoneShape } from './zone-shape';
import { ZoneRecovery } from './zone-recovery';
export function ZoneForm({ edit, locationId, command, onClose }: ZoneFormProps) {
  const [profile, setProfile] = useState(
    edit.action === 'CREATE' ? emptyZoneProfile() : edit.zone.profile,
  );
  const [hours, setHours] = useState(formatZoneHours(profile.activeHours));
  const [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const hoursId = useId();
  const editable = edit.action === 'CREATE' || edit.action === 'UPDATE';
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (command.locked) return;
        setError('');
        try {
          const body = deliveryZoneCommandSchema.safeParse({
            action: edit.action,
            locationId,
            requestKey: crypto.randomUUID(),
            ...(edit.action === 'CREATE' ? {} : { version: edit.zone.version }),
            ...(editable ? { profile: { ...profile, activeHours: parseZoneHours(hours) } } : {}),
          });
          if (!body.success) {
            setError(body.error.issues[0]!.message);
            return;
          }
          if (!editable && !confirmed) return;
          void command.send({
            zoneId: edit.action === 'CREATE' ? edit.zoneId : edit.zone.id,
            body: body.data,
          });
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : text.invalidHours);
        }
      }}
    >
      {editable ? (
        <>
          <Field
            label={text.name}
            required
            maxLength={120}
            disabled={command.locked}
            value={profile.name}
            onChange={(event) => setProfile({ ...profile, name: event.target.value })}
          />
          <ZoneShape
            shape={profile.shape}
            disabled={command.locked}
            onChange={(shape) => setProfile({ ...profile, shape })}
          />
          <ZonePricingFields profile={profile} disabled={command.locked} onChange={setProfile} />
          <div className="field">
            <label htmlFor={hoursId}>{text.hours}</label>
            <textarea
              id={hoursId}
              rows={4}
              maxLength={1500}
              disabled={command.locked}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              aria-describedby={`${hoursId}-hint`}
            />
            <small id={`${hoursId}-hint`}>{text.hoursHint}</small>
          </div>
        </>
      ) : (
        <>
          <p>{edit.action === 'ARCHIVE' ? text.archiveHint : text.restoreHint}</p>
          <label className="inline">
            <input
              type="checkbox"
              required
              disabled={command.locked}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {text.confirm}
          </label>
        </>
      )}
      {(error || command.error) && <Notice>{error || command.error}</Notice>}
      <ZoneRecovery command={command} />
      {command.stale && <Notice>{text.stale}</Notice>}
      <div className="inline">
        <Button
          type="submit"
          disabled={command.locked || (!editable && !confirmed)}
          busy={command.busy}
        >
          {editable ? text.save : edit.action === 'ARCHIVE' ? text.archive : text.restore}
        </Button>
        <Button type="button" variant="secondary" disabled={command.busy} onClick={onClose}>
          {text.cancel}
        </Button>
      </div>
    </form>
  );
}
