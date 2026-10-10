import type {
  CreateInventoryItemRequest,
  UpdateInventoryItemRequest,
  InventoryItemResponse,
  InventoryItemsResponse,
  InventoryProductsResponse,
  InventoryMovementsResponse,
  CreateInventoryDocumentRequest,
  InventoryDocumentResponse,
  CreateRecipeRequest,
  RecipeResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { LedgerFilters } from '../model/inventory.types';
export async function readInventoryItems(api: Api, locationId: string, cursor?: string) {
  const { data } = await api.http.get<InventoryItemsResponse>('/inventory/items', {
    params: { locationId: locationId || undefined, cursor },
  });
  return data;
}
export async function readInventoryItem(api: Api, id: string, locationId: string) {
  const { data } = await api.http.get<InventoryItemResponse>(`/inventory/items/${id}`, {
    params: { locationId: locationId || undefined },
  });
  return data.item;
}
export async function createInventoryItem(api: Api, input: CreateInventoryItemRequest) {
  const { data } = await api.http.post<InventoryItemResponse>('/inventory/items', input);
  return data.item;
}
export async function updateInventoryItem(api: Api, id: string, input: UpdateInventoryItemRequest) {
  const { data } = await api.http.patch<InventoryItemResponse>(`/inventory/items/${id}`, input);
  return data.item;
}
export async function readInventoryProducts(api: Api, cursor?: string) {
  const { data } = await api.http.get<InventoryProductsResponse>('/inventory/products', {
    params: { cursor },
  });
  return data;
}
export async function readRecipe(api: Api, productId: string) {
  const { data } = await api.http.get<RecipeResponse>(`/inventory/recipes/${productId}`);
  return data.recipe;
}
export async function createRecipe(api: Api, productId: string, input: CreateRecipeRequest) {
  const { data } = await api.http.post<RecipeResponse>(`/inventory/recipes/${productId}`, input);
  return data;
}
export async function createInventoryDocument(api: Api, input: CreateInventoryDocumentRequest) {
  const { data } = await api.http.post<InventoryDocumentResponse>('/inventory/documents', input);
  return data;
}
export async function readInventoryMovements(
  api: Api,
  locationId: string,
  filters: LedgerFilters,
  cursor?: string,
) {
  const { data } = await api.http.get<InventoryMovementsResponse>('/inventory/movements', {
    params: {
      locationId,
      inventoryItemId: filters.inventoryItemId || undefined,
      kind: filters.kind || undefined,
      cursor,
    },
  });
  return data;
}
