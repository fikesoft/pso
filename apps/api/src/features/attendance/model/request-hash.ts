import { createHash } from 'node:crypto';

export function attendanceRequestHash(
  action: string,
  locationId: string,
  shiftId?: string,
  version?: number,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({ action, locationId, shiftId: shiftId ?? null, version: version ?? null }),
    )
    .digest('hex');
}
