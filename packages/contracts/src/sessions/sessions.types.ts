export interface ActiveTenantSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  authenticationMethod: 'PASSWORD' | 'PIN';
  current: boolean;
}

export interface ActiveSessionsResponse {
  sessions: ActiveTenantSession[];
  nextCursor: string | null;
}

export interface RevokeSessionResponse {
  revoked: number;
  currentRevoked: boolean;
}
