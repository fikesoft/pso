export const CUSTOMER_RFM_POLICY = {
  version: 'RFM_V1',
  recencyDays: [7, 30, 60, 90],
  frequencyMinimums: [2, 3, 5, 10],
  monetaryMinimums: ['100.00', '500.00', '1000.00', '2500.00'],
} as const;
export const CUSTOMER_RFM_SEGMENTS = [
  'VIP',
  'LOYAL',
  'NEW',
  'AT_RISK',
  'LOST',
  'HIGH_SPENDERS',
  'FREQUENT',
] as const;
