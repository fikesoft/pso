import type { ModifierGroupDto, ModifierOptionDto, ProductModifierGroupDto } from '../shared';

export interface ModifierGroupsResponse {
  modifierGroups: ModifierGroupDto[];
  nextCursor: string | null;
}
export interface ModifierGroupResponse {
  modifierGroup: ModifierGroupDto;
}
export interface ModifierOptionsResponse {
  modifierOptions: ModifierOptionDto[];
  nextCursor: string | null;
}
export interface ModifierOptionResponse {
  modifierOption: ModifierOptionDto;
}
export interface ProductModifierGroupsResponse {
  modifierGroups: ProductModifierGroupDto[];
  nextCursor: string | null;
}
export interface ProductModifierGroupResponse {
  modifierGroup: ProductModifierGroupDto;
}
