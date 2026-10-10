import type { z } from 'zod';
import type { createDelegationSchema } from '../access';
import type { loginRequestSchema } from '../authentication';
import type { publicUserSchema, sessionResponseSchema } from '../responses';
import type { createRoleSchema } from '../roles';
import type { assignmentSchema } from '../shared';
import type { createStaffSchema } from '../staff';
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type CreateStaffRequest = z.infer<typeof createStaffSchema>;
export type CreateRoleRequest = z.infer<typeof createRoleSchema>;
export type CreateDelegationRequest = z.infer<typeof createDelegationSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export type AssignmentRequest = z.infer<typeof assignmentSchema>;
