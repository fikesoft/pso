import type {
  ModifierGroupDto,
  ModifierOptionDto,
  ModifierGroupResponse,
  ModifierGroupsResponse,
  ModifierOptionsResponse,
  ModifierOptionResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import { formText } from '../../../shared/lib';

export async function readModifierGroups(api: Api, locationId: string, cursor?: string) {
  return (
    await api.http.get<ModifierGroupsResponse>('/catalog/modifier-groups', {
      params: { locationId, includeArchived: true, cursor },
    })
  ).data;
}
export async function readModifierGroup(api: Api, locationId: string, groupId: string) {
  return (
    await api.http.get<ModifierGroupResponse>(`/catalog/modifier-groups/${groupId}`, {
      params: { locationId, includeArchived: true },
    })
  ).data.modifierGroup;
}
export async function saveModifierGroup(api: Api, group: ModifierGroupDto | null, form: FormData) {
  const body = {
    name: formText(form, 'name'),
    minSelections: Number(formText(form, 'minSelections')),
    maxSelections: Number(formText(form, 'maxSelections')),
    sortOrder: Number(formText(form, 'sortOrder')),
  };
  const response = group
    ? await api.http.patch<ModifierGroupResponse>(`/catalog/modifier-groups/${group.id}`, {
        ...body,
        version: group.version,
        status: formText(form, 'status'),
      })
    : await api.http.post<ModifierGroupResponse>('/catalog/modifier-groups', body);
  return response.data.modifierGroup;
}
export async function readModifierOptions(
  api: Api,
  locationId: string,
  groupId: string,
  cursor?: string,
) {
  return (
    await api.http.get<ModifierOptionsResponse>(`/catalog/modifier-groups/${groupId}/options`, {
      params: { locationId, includeArchived: true, cursor },
    })
  ).data;
}
export async function readModifierOption(
  api: Api,
  locationId: string,
  groupId: string,
  optionId: string,
) {
  return (
    await api.http.get<ModifierOptionResponse>(
      `/catalog/modifier-groups/${groupId}/options/${optionId}`,
      {
        params: { locationId, includeArchived: true },
      },
    )
  ).data.modifierOption;
}
export async function saveModifierOption(
  api: Api,
  groupId: string,
  option: ModifierOptionDto | null,
  form: FormData,
) {
  const path = `/catalog/modifier-groups/${groupId}/options`;
  const body = {
    name: formText(form, 'name'),
    extraPrice: formText(form, 'extraPrice').replace(',', '.'),
    sortOrder: Number(formText(form, 'sortOrder')),
  };
  const response = option
    ? await api.http.patch<ModifierOptionResponse>(`${path}/${option.id}`, {
        ...body,
        version: option.version,
        status: formText(form, 'status'),
      })
    : await api.http.post<ModifierOptionResponse>(path, body);
  return response.data.modifierOption;
}
