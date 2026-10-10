import '../src/shared/styles/operator.css';
import '../src/shared/styles/operations.css';
import '../src/shared/styles/kitchen-alerts.css';
import '../src/shared/styles/packing.css';
import '../src/shared/styles/checkout.css';
import '../src/shared/styles/inventory.css';
import '../src/shared/styles/website-delivery.css';
import '@pos/ui/styles.css';
import type { RootLayoutProps } from './model/route.types';
export { metadata } from './config/metadata.constants';
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
