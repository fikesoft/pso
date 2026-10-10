import type { z } from 'zod';
import type {
  KITCHEN_STATUSES,
  ORDER_STATUSES,
  SERVICE_TYPES,
} from '../orders/config/order.constants';
import type {
  ORDER_RESPONSIBILITY_STATES,
  ORDER_RESPONSIBILITY_COMMAND_KINDS,
  ORDER_RESPONSIBILITY_EVENT_KINDS,
  ORDER_RESPONSIBILITY_DISABLED_REASONS,
} from './config/order-responsibility.constants';
import type {
  orderResponsibilityListSchema,
  orderResponsibilityDetailSchema,
  orderResponsibilityHistorySchema,
  orderResponsibilityCommandSchema,
  orderResponsibilityResolutionSchema,
} from './order-responsibility.schema';
export type OrderResponsibilityState = (typeof ORDER_RESPONSIBILITY_STATES)[number];
export type OrderResponsibilityCommandKind = (typeof ORDER_RESPONSIBILITY_COMMAND_KINDS)[number];
export type OrderResponsibilityEventKind = (typeof ORDER_RESPONSIBILITY_EVENT_KINDS)[number];
export type OrderResponsibilityListRequest = z.input<typeof orderResponsibilityListSchema>;
export type OrderResponsibilityDetailRequest = z.input<typeof orderResponsibilityDetailSchema>;
export type OrderResponsibilityHistoryRequest = z.input<typeof orderResponsibilityHistorySchema>;
export type OrderResponsibilityCommandRequest = z.input<typeof orderResponsibilityCommandSchema>;
export type OrderResponsibilityResolutionRequest = z.input<
  typeof orderResponsibilityResolutionSchema
>;
export type OrderResponsibilityCommandIdentity = OrderResponsibilityResolutionRequest & {
  orderId: string;
};
export interface OrderResponsibilityOwnerDto {
  userId: string;
  displayName: string;
}
export interface OrderResponsibilityShiftDto {
  id: string;
  registerId: string;
  registerCode: string;
  registerName: string;
}
export interface OrderResponsibilityRegisterDto {
  id: string;
  code: string;
  name: string;
}
export interface OrderResponsibilityDto {
  state: OrderResponsibilityState;
  version: number;
  owner: OrderResponsibilityOwnerDto | null;
  shift: OrderResponsibilityShiftDto | null;
  pendingEventId: string | null;
  preparedAt: string | null;
  preparedReason: string | null;
}
export interface OrderResponsibilityRowDto {
  order: {
    id: string;
    number: number;
    status: (typeof ORDER_STATUSES)[number];
    kitchenStatus: (typeof KITCHEN_STATUSES)[number];
    serviceType: (typeof SERVICE_TYPES)[number];
    total: string;
    currency: 'MDL';
    outstandingAmount: string;
    version: number;
  };
  responsibility: OrderResponsibilityDto;
  provenance: {
    kind: 'NEVER_ASSIGNED' | 'REFUND_REOPENED' | 'EXPLICIT_ASSIGNMENT' | 'PENDING_HANDOFF';
    eventId: string | null;
  };
  actions: { assign: boolean; prepare: boolean; accept: boolean };
  disabledReason: (typeof ORDER_RESPONSIBILITY_DISABLED_REASONS)[number] | null;
}
export interface OrderResponsibilityEventDto {
  eventId: string;
  orderId: string;
  locationId: string;
  kind: OrderResponsibilityEventKind;
  actorUserId: string;
  actorDisplayName: string;
  orderVersion: number;
  responsibilityVersion: number;
  previousState: OrderResponsibilityState;
  resultState: OrderResponsibilityState;
  orderNumber: number;
  orderTotal: string;
  outstandingSnapshot: string;
  fromOwner: OrderResponsibilityOwnerDto | null;
  toOwner: OrderResponsibilityOwnerDto | null;
  sourceShift: OrderResponsibilityShiftDto | null;
  targetShift: OrderResponsibilityShiftDto | null;
  targetRegister: OrderResponsibilityRegisterDto | null;
  handoffEventId: string | null;
  reason: string | null;
  managerReason: string | null;
  source: {
    orderEventId: string;
    paymentOperationId: string | null;
    checkoutId: string | null;
  } | null;
  createdAt: string;
}
export type OrderResponsibilityCommandResultDto = OrderResponsibilityEventDto & {
  kind: OrderResponsibilityCommandKind;
  commandKind: OrderResponsibilityCommandKind;
  reason: string;
};
export interface OrderResponsibilityCommandResponse {
  event: OrderResponsibilityCommandResultDto;
}
export interface OrderResponsibilityListResponse {
  orders: OrderResponsibilityRowDto[];
  nextCursor: string | null;
  timezone: string;
}
export type OrderResponsibilityDetailResponse = OrderResponsibilityRowDto;
export interface OrderResponsibilityHistoryResponse {
  events: OrderResponsibilityEventDto[];
  nextCursor: string | null;
  timezone: string;
}
export type OrderResponsibilityResolutionResponse =
  | {
      status: 'SUCCEEDED';
      command: OrderResponsibilityCommandIdentity;
      result: OrderResponsibilityCommandResponse;
    }
  | { status: 'RETIRED'; command: OrderResponsibilityCommandIdentity };
