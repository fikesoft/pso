import type { z } from 'zod';
import type { KitchenStatus, OrderStatus, ServiceType } from '../orders';
import type { PACKING_SESSION_STATUSES, PACKING_BOARD_FILTERS } from './config/packing.constants';
import type {
  packingCommandSchema,
  packingCommandResultSchema,
  packingListQuerySchema,
  resolvePackingCommandSchema,
} from './packing.schema';

export type PackingSessionStatus = (typeof PACKING_SESSION_STATUSES)[number];
export type PackingStatus = 'NOT_REQUIRED' | PackingSessionStatus;
export type PackingBoardFilter = (typeof PACKING_BOARD_FILTERS)[number];
export type PackingCommandInput = z.infer<typeof packingCommandSchema>;
export type PackingCommandResult = z.infer<typeof packingCommandResultSchema>;
export type ResolvePackingCommandInput = z.infer<typeof resolvePackingCommandSchema>;
export type PackingListQuery = z.infer<typeof packingListQuerySchema>;

export interface PackingModifierGroupDto {
  groupName: string;
  options: string[];
}

export interface PackingItemDto {
  id: string;
  orderItemId: string;
  position: number;
  productName: string;
  quantity: string;
  note: string | null;
  modifierGroups: PackingModifierGroupDto[];
  checked: boolean;
  checkedAt: string | null;
}

export interface PackingSessionDto {
  id: string;
  locationId: string;
  orderId: string;
  ticketId: string;
  orderNumber: number;
  orderStatus: OrderStatus;
  kitchenStatus: KitchenStatus;
  serviceType: ServiceType;
  tableLabel: string | null;
  status: PackingSessionStatus;
  version: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  items: PackingItemDto[];
}

export interface PackingListResponse {
  sessions: PackingSessionDto[];
  nextCursor: string | null;
}
export type PackingCommandResolution =
  | {
      status: 'SUCCEEDED';
      command: ResolvePackingCommandInput;
      result: PackingCommandResult;
    }
  | { status: 'RETIRED'; command: ResolvePackingCommandInput };
