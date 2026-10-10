import type {
  CreateModifierRecipeRequest,
  ModifierRecipeResponse,
  ModifierRecipeOptionsResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';

export async function readModifierRecipe(api: Api, productId: string, optionId: string) {
  return (
    await api.http.get<ModifierRecipeResponse>(
      `/inventory/modifier-recipes/${productId}/${optionId}`,
    )
  ).data;
}
export async function readModifierRecipeOptions(api: Api, productId: string) {
  return (
    await api.http.get<ModifierRecipeOptionsResponse>(
      `/inventory/products/${productId}/modifier-options`,
    )
  ).data;
}
export async function publishModifierRecipe(
  api: Api,
  productId: string,
  optionId: string,
  input: CreateModifierRecipeRequest,
) {
  return (
    await api.http.post<ModifierRecipeResponse>(
      `/inventory/modifier-recipes/${productId}/${optionId}`,
      input,
    )
  ).data;
}
