import type { ReactNode } from 'react';
export interface RootLayoutProps {
  children: ReactNode;
}
export interface CompanyRouteProps {
  params: Promise<{ slug: string }>;
}
