import { roMessages } from '@pos/ui/locales';
import '@pos/ui/styles.css';
import type { Metadata } from 'next';
import type { RootLayoutProps } from '../src/shared/model/layout.types';
export const metadata: Metadata = {
  title: roMessages.message328,
  description: roMessages.message078,
};
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
