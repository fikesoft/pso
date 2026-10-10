import { attendanceMessages as text } from '@pos/ui/locales';

export function attendanceDuration(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
export function attendanceMoment(value: string | null, timezone?: string) {
  return value
    ? new Intl.DateTimeFormat('ro-MD', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(new Date(value))
    : '—';
}
export function attendanceStatus(status: string) {
  return status === 'ACTIVE' ? text.active : status === 'ON_BREAK' ? text.onBreak : text.ended;
}
export function defaultAttendancePeriod(timezone = 'UTC', now = new Date()) {
  const to = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(now);
  const from = new Date(`${to}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to };
}
