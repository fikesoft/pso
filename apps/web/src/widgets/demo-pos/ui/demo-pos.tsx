import { roMessages, Modal } from '@pos/ui';
import { useDemoPos } from '../model/use-demo-pos';
import { DemoHeader } from './demo-header';
import { DemoProductFilters } from './demo-product-filters';
import { DemoProducts } from './demo-products';
import { DemoCart } from './demo-cart';
import { DemoMobileNavigation } from './demo-mobile-navigation';
import { DemoProductDialog } from './demo-product-dialog';
export function DemoPos() {
  const model = useDemoPos();
  return (
    <main className="pos-demo">
      <DemoHeader />
      <div className="demo-warning">{roMessages.message052}</div>
      <div className="pos-layout">
        <section className="product-area">
          <DemoProductFilters model={model} />
          <DemoProducts model={model} />
        </section>
        <aside className="cart-panel">
          <DemoCart model={model} />
        </aside>
      </div>
      <DemoMobileNavigation model={model} />
      <DemoProductDialog model={model} />
      <Modal
        open={model.cartOpen}
        onOpenChange={model.setCartOpen}
        title={roMessages.message075}
        description={roMessages.message076}
      >
        <DemoCart model={model} />
      </Modal>
    </main>
  );
}
