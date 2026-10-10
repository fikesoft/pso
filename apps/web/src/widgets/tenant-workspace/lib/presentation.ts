import { ro } from '@pos/ui';
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
export const active = (status?: string) => status === 'ACTIVE';
export function statusLabel(status?: string) {
  return status === 'ACTIVE'
    ? ro.states.active
    : status === 'PENDING'
      ? ro.states.pending
      : status === 'REVOKED'
        ? ro.states.revoked
        : ro.states.disabled;
}
