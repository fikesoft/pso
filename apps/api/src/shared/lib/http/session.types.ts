import type { Prisma } from '@pos/db';
import type { Request } from 'express';
export type PrincipalKind = 'TENANT' | 'PLATFORM';
export type SessionUser = {
  id: string;
  organizationId?: string;
  loginNormalized: string;
  displayName: string;
  passwordHash: string;
  authenticationMethod?: string;
  pinHash?: string | null;
  pinLookup?: string | null;
  status: string;
  authVersion: number;
  mustChangePassword: boolean;
  mfaRequired: boolean;
  isPrimaryAdmin?: boolean;
  version?: number;
  temporaryPasswordExpiresAt?: Date | string | null;
};
export type SessionOrganization = Pick<
  Prisma.OrganizationGetPayload<Record<string, never>>,
  'id' | 'slug' | 'name' | 'currency' | 'locale' | 'timezone' | 'status' | 'policyVersion'
>;
export type SessionRecord = {
  id: string;
  authVersion: number;
  expiresAt: Date | string;
  idleExpiresAt: Date | string;
  revokedAt: Date | string | null;
  mfaVerifiedAt: Date | string | null;
  authenticationMethod?: string;
};
export type AuthState = {
  kind: PrincipalKind;
  user: SessionUser;
  organization?: SessionOrganization;
  session: SessionRecord;
  credential: Prisma.MfaCredentialGetPayload<Record<string, never>> | null;
  rawToken: string;
  stage: 'password' | 'enroll' | 'mfa' | 'ready';
};
export type TenantAuthState = AuthState & {
  kind: 'TENANT';
  user: SessionUser & { organizationId: string };
};
export type TenantSessionLookup = {
  data: { user: SessionUser; organization: SessionOrganization; session: SessionRecord } | null;
};
export type TenantLoginLookup = {
  data: { user: SessionUser; organization: SessionOrganization } | null;
};
export type AuthRequest = Request & { auth?: AuthState; requestId: string };
export type TenantActorReference = {
  user: { id: string; organizationId: string };
  session: { id: string; authVersion: number };
};
