import type { ModifierGroupSnapshotDto, ModifierSelectionInput } from '@pos/contracts';

export type ModifierChoices = Record<string, string[]>;
export interface ModifierPreview {
  valid: boolean;
  unitPrice: string;
  selections: ModifierSelectionInput[];
  snapshots: ModifierGroupSnapshotDto[];
}
