export interface CatalogCategory {
  id: string;
  name: string;
  sortOrder: number;
  version: number;
  status: 'ACTIVE' | 'ARCHIVED';
}

import type { ProductInformation } from './product-information.types';

export interface CatalogProduct extends ProductInformation {
  id: string;
  categoryId: string | null;
  name: string;
  sku: string;
  description: string | null;
  taxRate: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
  locationId: string;
  price: string | null;
  enabled: boolean;
  locationVersion: number | null;
  imageUrl: string | null;
  modifierGroups: ProductModifierGroupDto[];
  scheduleAvailability: ProductScheduleAvailability | null;
}

export interface CatalogResponse {
  categories: CatalogCategory[];
  products: CatalogProduct[];
  nextCursor: string | null;
}
import type { ProductModifierGroupDto } from '../shared';
import type { ProductScheduleAvailability } from '../menu-schedules';
