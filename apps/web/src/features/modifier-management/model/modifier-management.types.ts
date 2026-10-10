import type { FormEvent } from 'react';
import type { ModifierGroupDto, ModifierOptionDto } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useModifierGroups } from './use-modifier-groups';
import type { useModifierOptions } from './use-modifier-options';

export interface ModifierManagementProps {
  api: Api;
  locationId: string;
  locationName: string;
}
export type ModifierGroupsModel = ReturnType<typeof useModifierGroups>;
export interface ModifierGroupListProps {
  model: ModifierGroupsModel;
}
export interface GroupDialogProps {
  group: ModifierGroupDto | null | undefined;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onReload: () => Promise<void>;
}
export interface ModifierOptionsProps extends ModifierManagementProps {
  group: ModifierGroupDto;
  onBack: () => void;
  onChanged: () => Promise<void>;
}
export type ModifierOptionsModel = ReturnType<typeof useModifierOptions>;
export interface ModifierOptionListProps {
  model: ModifierOptionsModel;
}
export interface OptionDialogProps extends Omit<GroupDialogProps, 'group'> {
  option: ModifierOptionDto | null | undefined;
}
