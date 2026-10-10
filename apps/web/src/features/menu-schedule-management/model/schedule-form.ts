import { menuScheduleMessages as text } from '@pos/ui/locales';
import { MAX_SCHEDULE_PRODUCTS } from '@pos/contracts/menu-schedules';
import { formText } from '../../../shared/lib';
import type { CreateMenuSchedule } from '@pos/contracts';

export function timeLabel(minute: number) {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
}
function minutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}
export function scheduleForm(
  form: FormData,
): Omit<CreateMenuSchedule, 'locationId' | 'requestKey'> {
  const value = {
    name: formText(form, 'name').trim(),
    eventName: formText(form, 'eventName').trim() || null,
    weekdays: form.getAll('weekdays').map(Number),
    startMinute: minutes(formText(form, 'startTime')),
    endMinute: form.has('midnight') ? 1440 : minutes(formText(form, 'endTime')),
    startsOn: formText(form, 'startsOn') || null,
    endsOn: formText(form, 'endsOn') || null,
    productIds: form.getAll('productIds').map(String),
  };
  if (
    !value.weekdays.length ||
    !value.productIds.length ||
    value.productIds.length > MAX_SCHEDULE_PRODUCTS ||
    value.startMinute === value.endMinute ||
    (value.startsOn && value.endsOn && value.startsOn > value.endsOn) ||
    (value.eventName && (!value.startsOn || !value.endsOn))
  )
    throw new Error(text.validation);
  return value;
}
