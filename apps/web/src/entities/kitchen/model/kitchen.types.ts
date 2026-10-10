import type { KitchenResponse } from '@pos/contracts';

export interface KitchenPage extends KitchenResponse {
  receivedAt: number;
}
