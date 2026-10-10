import { useCallback, useState } from 'react';
import { Button, Field, Loading, Notice } from '@pos/ui';
import { employeeMessages as text } from '@pos/ui/locales';
import { AttendanceHistory, defaultAttendancePeriod } from '../../../entities/attendance';
import { formText, useRemoteData } from '../../../shared/lib';
import { readEmployeeProfile } from '../api/employee-profile.api';
import type { EmployeeProfileProps } from '../model/employee-profile.types';
import { ProfileIdentity } from './profile-identity';
import { ProfileMetrics } from './profile-metrics';

export function EmployeeProfile({
  api,
  userId,
  locationId,
  timezone,
  renderImage,
  onLockedChange,
}: EmployeeProfileProps) {
  const [imageLocked, setImageLocked] = useState(false);
  const lockImage = useCallback(
    (locked: boolean) => {
      setImageLocked(locked);
      onLockedChange?.(locked);
    },
    [onLockedChange],
  );
  const [period, setPeriod] = useState(() => defaultAttendancePeriod(timezone));
  const profile = useRemoteData(
    useCallback(
      () => readEmployeeProfile({ api, userId, locationId }, period),
      [api, userId, locationId, period],
    ),
  );
  return (
    <section className="panel" aria-label={text.profile}>
      <div className="panel-head">
        <h2>{text.profile}</h2>
        <Button
          variant="secondary"
          disabled={profile.loading || imageLocked}
          onClick={() => void profile.refresh()}
        >
          {text.reload}
        </Button>
      </div>
      <div className="panel-body form-stack">
        <form
          className="attendance-filters"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setPeriod({ from: formText(form, 'from'), to: formText(form, 'to') });
          }}
        >
          <Field
            label={text.from}
            type="date"
            name="from"
            defaultValue={period.from}
            disabled={imageLocked}
            required
          />
          <Field
            label={text.to}
            type="date"
            name="to"
            defaultValue={period.to}
            disabled={imageLocked}
            required
          />
          <Button type="submit" busy={profile.loading} disabled={imageLocked}>
            {text.apply}
          </Button>
        </form>
        {profile.error && <Notice>{profile.error}</Notice>}
        {profile.loading ? (
          <Loading />
        ) : (
          !profile.error &&
          profile.data && (
            <>
              <p className="scope-hint">
                {text.scope}:{' '}
                {profile.data.locations
                  .filter((location) => profile.data!.scope.locationIds.includes(location.id))
                  .map((location) => location.name)
                  .join(', ') || text.noValue}
                <br />
                {profile.data.scope.from} – {profile.data.scope.to} · {profile.data.scope.timezone}
              </p>
              {renderImage?.(
                profile.data.user,
                async () => {
                  await profile.refresh();
                },
                lockImage,
              )}
              <ProfileIdentity profile={profile.data} />
              <ProfileMetrics profile={profile.data} />
              <h3>{text.recentShifts}</h3>
              {profile.data.attendance ? (
                <AttendanceHistory
                  shifts={profile.data.attendance.recentShifts}
                  timezone={profile.data.scope.timezone}
                />
              ) : (
                <p className="muted">{text.noPermission}</p>
              )}
            </>
          )
        )}
      </div>
    </section>
  );
}
