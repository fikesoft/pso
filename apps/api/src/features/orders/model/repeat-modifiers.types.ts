import type { ModifierSelectionInput, OrderRepeatIssue } from '@pos/contracts';
export interface RepeatModifierResolution {
  selections: ModifierSelectionInput[];
  issues: OrderRepeatIssue[];
}
