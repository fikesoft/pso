export interface ResponsibilityFixtureCommand {
  kind: 'ASSIGN' | 'PREPARE_HANDOFF' | 'ACCEPT_HANDOFF';
  actor?: string;
  sourceShiftId?: string;
  targetShiftId?: string;
  handoffEventId?: string;
  requestKey?: string;
  requestHash?: string;
  managerReason?: string;
  previousVersion?: number;
  orderVersion?: number;
  commandFirst?: boolean;
  omit?: 'command' | 'event';
}
