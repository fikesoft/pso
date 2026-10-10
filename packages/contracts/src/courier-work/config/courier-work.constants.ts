export const COURIER_WORK_VIEWS = ['ACTIVE', 'HISTORY'] as const;
export const COURIER_WORK_ACTIVE_STATUSES = ['ASSIGNED', 'PICKED_UP', 'DELIVERING'] as const;
export const COURIER_WORK_HISTORY_STATUSES = ['DELIVERED', 'FAILED'] as const;
export const COURIER_WORK_LIMITS = {
  page: 20,
  maximumPage: 50,
  scanBatch: 50,
  scanBudget: 300,
} as const;
