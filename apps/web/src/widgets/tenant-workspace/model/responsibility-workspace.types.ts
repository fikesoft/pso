import type { ResponsibilityProps } from '../../../features/order-responsibility-management';
export interface ResponsibilityWorkspaceProps extends ResponsibilityProps {
  registerGuard: (guard: (() => boolean) | null) => void;
  onBlockingChange: (blocked: boolean) => void;
}
