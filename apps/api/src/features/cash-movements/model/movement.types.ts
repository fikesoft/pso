import type { z } from 'zod';
import type { cashMovementListSchema } from '@pos/contracts';
export type MovementCursorContext = z.output<typeof cashMovementListSchema> & {
  organizationId: string;
  actor: string;
  shiftId: string;
  timezone: string;
};
