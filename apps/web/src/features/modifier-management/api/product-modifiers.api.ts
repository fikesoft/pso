import type {
  ProductModifierGroupDto,
  ProductModifierGroupsResponse,
  ProductModifierGroupResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import { formText } from '../../../shared/lib';

export async function readProductModifierGroups(
  api: Api,
  locationId: string,
  productId: string,
  editable: boolean,
  cursor?: string,
) {
  return (
    await api.http.get<ProductModifierGroupsResponse>(
      `/catalog/products/${productId}/modifier-groups`,
      {
        params: { locationId, includeArchived: editable ? true : undefined, cursor },
      },
    )
  ).data;
}
export async function saveProductModifierGroup(
  api: Api,
  productId: string,
  binding: ProductModifierGroupDto | null,
  form: FormData,
) {
  const path = `/catalog/products/${productId}/modifier-groups`;
  const sortOrder = Number(formText(form, 'sortOrder'));
  return binding
    ? (
        await api.http.patch<ProductModifierGroupResponse>(`${path}/${binding.id}`, {
          version: binding.version,
          sortOrder,
          status: formText(form, 'status'),
        })
      ).data
    : (
        await api.http.post<ProductModifierGroupResponse>(path, {
          modifierGroupId: formText(form, 'modifierGroupId'),
          sortOrder,
        })
      ).data;
}
