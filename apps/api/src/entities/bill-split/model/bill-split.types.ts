export interface BillSourceAmount {
  orderId: string;
  amount: string;
}
export type BillDivision = { mode: 'EQUAL'; count: number } | { mode: 'CUSTOM'; amounts: string[] };
export interface BillAllocationAmount {
  orderId: string;
  amount: string;
}
export interface BillPartAmount {
  position: number;
  amount: string;
  allocations: BillAllocationAmount[];
}
export interface BillDistribution {
  total: string;
  parts: BillPartAmount[];
}
