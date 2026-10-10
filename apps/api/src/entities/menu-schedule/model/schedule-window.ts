import type { MenuScheduleWindow } from '@pos/contracts';
import type { LocalScheduleTime } from './menu-schedule.types';

export function localScheduleTime(instant: Date, timezone: string): LocalScheduleTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)!.value;
  const date = `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
  const day = new Date(`${date}T12:00:00.000Z`);
  const weekday = day.getUTCDay();
  day.setUTCDate(day.getUTCDate() - 1);
  return {
    date,
    previousDate: day.toISOString().slice(0, 10),
    weekday,
    previousWeekday: (weekday + 6) % 7,
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

export function scheduleMatches(schedule: MenuScheduleWindow, local: LocalScheduleTime) {
  const overnight = schedule.endMinute < schedule.startMinute;
  const afterMidnight = overnight && local.minute < schedule.endMinute;
  const date = afterMidnight ? local.previousDate : local.date;
  const weekday = afterMidnight ? local.previousWeekday : local.weekday;
  if (!schedule.weekdays.includes(weekday)) return false;
  if (schedule.startsOn && date < schedule.startsOn) return false;
  if (schedule.endsOn && date > schedule.endsOn) return false;
  if (overnight) return afterMidnight || local.minute >= schedule.startMinute;
  return local.minute >= schedule.startMinute && local.minute < schedule.endMinute;
}
