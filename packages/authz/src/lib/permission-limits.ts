import { getPermission } from '../catalog.js';
import { validLimits } from './decimal.js';
import type { Limits } from '../model/authorization.types.js';
/** Omitted support metadata preserves the existing permission policy. DENY never uses this filter. */
export function supportsPermissionLimits(action: string, limits: Limits = {}): boolean {
  if (!validLimits(limits)) return false;
  const definition = getPermission(action);
  if (!definition) return false;
  return (
    definition.supportedLimits === undefined ||
    (Object.keys(limits) as (keyof Limits)[]).every(
      (key) => limits[key] === undefined || definition.supportedLimits!.includes(key),
    )
  );
}
