export const DELIVERY_ZONE_LIMITS = {
  maxVertices: 50,
  maxRadiusMeters: 100_000,
  earthRadiusMeters: 6_371_008.8,
  coordinateEpsilon: 1e-10,
  maxScheduleWindows: 28,
  maxEstimatedMinutes: 1440,
} as const;
export const DELIVERY_ZONE_ACTIONS = ['CREATE', 'UPDATE', 'ARCHIVE', 'RESTORE'] as const;
