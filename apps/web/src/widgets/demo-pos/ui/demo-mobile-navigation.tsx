import { roMessages, Badge, Store, ShoppingBasket } from '@pos/ui';
import type { DemoPosComponentProps } from '../model/demo-pos.types';
export function DemoMobileNavigation({ model }: DemoPosComponentProps) {
  const { setCartOpen, quantity } = model;
  return (
    <nav className="pos-mobile-nav" aria-label={roMessages.message064}>
      <button onClick={() => setCartOpen(false)}>
        <Store size={20} />
        <span>{roMessages.message065}</span>
      </button>
      <button className="mobile-cart" onClick={() => setCartOpen(true)}>
        <ShoppingBasket size={20} />
        <span>{roMessages.message039}</span>
        <Badge tone="accent">{quantity}</Badge>
      </button>
    </nav>
  );
}
