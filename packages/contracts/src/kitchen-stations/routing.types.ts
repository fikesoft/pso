import type { z } from 'zod';
import type { kitchenRoutingIdentitySchema, kitchenRoutingSetSchema } from './routing.schema';
export type KitchenRoutingIdentity = z.infer<typeof kitchenRoutingIdentitySchema>;
export type KitchenRoutingSetRequest = z.infer<typeof kitchenRoutingSetSchema>;
export interface KitchenRoutingDto {
  locationId: string;
  productId: string;
  version: number;
  station: { id: string; code: string; name: string } | null;
}
export interface KitchenRoutingProduct {
  id: string;
  name: string;
  sku: string;
  routing: KitchenRoutingDto;
  stationArchived: boolean;
}
export interface KitchenRoutingProductsResponse {
  products: KitchenRoutingProduct[];
  nextCursor: string | null;
}
export type KitchenRoutingResolutionResponse =
  | { status: 'SUCCEEDED'; command: KitchenRoutingIdentity; result: { routing: KitchenRoutingDto } }
  | { status: 'RETIRED'; command: KitchenRoutingIdentity };
