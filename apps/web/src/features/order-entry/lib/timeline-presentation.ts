import { orderTimelineMessages as text } from '@pos/ui/locales';
export function timelineStatus(value: string | null) {
  if (!value) return text.unknownStatus;
  return (
    text.statuses[value as keyof typeof text.statuses] ??
    value.replaceAll('_', ' ').toLocaleLowerCase('ro-MD')
  );
}
export function timelineAction(value: string) {
  return text.actions[value as keyof typeof text.actions] ?? text.unknownAction;
}
