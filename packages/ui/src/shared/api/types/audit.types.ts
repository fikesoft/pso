export type AuditEvent = {
  id: string;
  action: string;
  targetId?: string;
  createdAt: string;
  outcome: string;
  actorLabel?: string;
};
