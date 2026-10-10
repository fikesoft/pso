import type { OrderResponsibilityCommandIdentity } from '@pos/contracts/order-responsibilities';
export interface ResponsibilityScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface ResponsibilityPointer extends ResponsibilityScope {
  command: OrderResponsibilityCommandIdentity;
}
export interface ResponsibilityStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
