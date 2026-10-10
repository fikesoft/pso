import { roMessages, Button, Badge, ShoppingBasket } from '@pos/ui';
import type { DemoPosComponentProps } from '../model/demo-pos.types';
export function DemoCart({ model }: DemoPosComponentProps) {
  const { draft, table, quantity, emptyCart } = model;
  return (
    <>
      <div className="cart-heading">
        <h2>{roMessages.message039}</h2>
        <Badge>{table}</Badge>
      </div>
      <p className="demo-subtext">{roMessages.message040}</p>
      {draft.length ? (
        <div className="draft-lines">
          {draft.map((item) => (
            <div className="draft-line" key={item.id}>
              <span className="draft-qty">{item.quantity}×</span>
              <strong>{item.name}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="cart-empty">
          <ShoppingBasket size={32} />
          <h3>{roMessages.message041}</h3>
          <p>{roMessages.message042}</p>
        </div>
      )}
      <div className="cart-footer">
        <div>
          <span>{roMessages.message043}</span>
          <strong>{quantity}</strong>
        </div>
        <Button variant="secondary" disabled={!draft.length} onClick={emptyCart}>
          {roMessages.message045}
        </Button>
        <p>{roMessages.message046}</p>
      </div>
    </>
  );
}
