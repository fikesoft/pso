export type ModifierStatus = 'ACTIVE' | 'ARCHIVED';

export interface ModifierOptionDto {
  id: string;
  modifierGroupId: string;
  name: string;
  extraPrice: string;
  sortOrder: number;
  status: ModifierStatus;
  version: number;
}

export interface ModifierGroupDto {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  sortOrder: number;
  status: ModifierStatus;
  version: number;
  options: ModifierOptionDto[];
}

export interface ProductModifierGroupDto {
  id: string;
  productId: string;
  modifierGroupId: string;
  sortOrder: number;
  status: ModifierStatus;
  version: number;
  group: ModifierGroupDto;
}

export interface ModifierSelectionInput {
  bindingId: string;
  bindingVersion: number;
  groupVersion: number;
  optionIds: string[];
}

export interface ModifierOptionSnapshotDto {
  optionId: string;
  optionName: string;
  extraPrice: string;
  optionVersion: number;
  position: number;
}

export interface ModifierGroupSnapshotDto {
  bindingId: string;
  groupId: string;
  groupName: string;
  minSelections: number;
  maxSelections: number;
  groupVersion: number;
  bindingVersion: number;
  position: number;
  options: ModifierOptionSnapshotDto[];
}
