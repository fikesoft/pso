import type { createModifierFixture } from './modifier.fixture';
export type ModifierFixture = Awaited<ReturnType<typeof createModifierFixture>>;
export type ModifierDraftOptions = {
  omitGroups?: boolean;
  omitSelection?: boolean;
  extraPrice?: string;
  groupName?: string;
  quantity?: string;
};
