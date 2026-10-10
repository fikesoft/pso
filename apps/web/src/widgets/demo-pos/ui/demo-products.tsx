import { roMessages, Check, X, Plus } from '@pos/ui';
import type { DemoPosComponentProps } from '../model/demo-pos.types';
export function DemoProducts({ model }: DemoPosComponentProps) {
  const { setSelected, message, setMessage, rows } = model;
  return (
    <>
      {message && (
        <div role="status" className="demo-message">
          <Check size={15} />
          {message}
          <button
            className="icon-button"
            aria-label={roMessages.message061}
            onClick={() => setMessage('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="product-grid">
        {rows.map((p) => (
          <button key={p.id} className="product-card" onClick={() => setSelected(p)}>
            <div className={`product-art art-${p.id}`} aria-hidden="true">
              {p.icon}
            </div>
            <div className="product-info">
              <small>{p.category}</small>
              <h2>{p.name}</h2>
              <p>{p.detail}</p>
              <div>
                <strong>
                  {p.price.replace('.', ',')} <small>{roMessages.message062}</small>
                </strong>
                <span className="product-plus">
                  <Plus size={17} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {!rows.length && (
        <div className="cart-empty">
          <p>{roMessages.message063}</p>
        </div>
      )}
    </>
  );
}
