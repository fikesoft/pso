import type { ReactNode, RefObject } from 'react';
import type { Session } from '@pos/ui/types';
import type { PlatformApi } from '../../../shared/model/api.types';
export type PlatformWorkspaceProps = {
  session: Session;
  api: PlatformApi;
  logout: () => Promise<void>;
};
export type PlatformSidebarProps = Pick<PlatformWorkspaceProps, 'session' | 'logout'> & {
  mobileOpen: boolean;
  navigationRef: RefObject<HTMLElement | null>;
  closeNavigation: () => void;
};
export type PlatformTopbarProps = {
  session: Session;
  mobileOpen: boolean;
  openNavigation: () => void;
};
export type PlatformShellProps = Pick<PlatformWorkspaceProps, 'session' | 'logout'> & {
  children: ReactNode;
};

export type PlatformSummaryProps = { count: number };
