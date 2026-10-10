export const COURIER_VEHICLES = ['WALK', 'BICYCLE', 'SCOOTER', 'CAR'] as const;
export const COURIER_AVAILABILITY = ['OFFLINE', 'AVAILABLE', 'PAUSED'] as const;
export const COURIER_PROFILE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export const COURIER_EFFECTIVE_STATUSES = [
  'OFFLINE',
  'AVAILABLE',
  'PAUSED',
  'IN_DELIVERY',
  'UNAVAILABLE',
  'ARCHIVED',
] as const;
export const COURIER_ACTIONS = [
  'CREATE',
  'UPDATE',
  'SET_AVAILABILITY',
  'ARCHIVE',
  'RESTORE',
] as const;
export const COURIER_LIMITS = { capacity: 20, pageSize: 30, maxPageSize: 100 } as const;
