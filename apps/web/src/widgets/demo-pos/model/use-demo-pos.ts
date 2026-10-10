import { roMessages } from '@pos/ui';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addDraft, clearDraft } from '../../../entities/workspace';
import type { RootState } from '../../../entities/workspace';
import { demoProducts } from '../config/products.constants';
import type { DemoProduct } from './demo-product.types';
export function useDemoPos() {
  const dispatch = useDispatch();
  const draft = useSelector((s: RootState) => s.workspace.draft);
  const [category, setCategory] = useState<string>(roMessages.message038);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<DemoProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [table, setTable] = useState<string>(roMessages.message001);
  const [message, setMessage] = useState('');
  const quantity = draft.reduce((sum, item) => sum + item.quantity, 0);
  const rows = demoProducts.filter(
    (p) =>
      (category === roMessages.message038 || p.category === category) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  function changeTable(value: string) {
    setTable(value);
    dispatch(clearDraft());
    setMessage(roMessages.message056);
  }
  function emptyCart() {
    dispatch(clearDraft());
    setMessage(roMessages.message044);
  }
  function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    dispatch(addDraft({ id: selected.id, name: selected.name }));
    setSelected(null);
    setMessage(roMessages.message068);
  }
  return {
    draft,
    category,
    setCategory,
    query,
    setQuery,
    selected,
    setSelected,
    cartOpen,
    setCartOpen,
    table,
    message,
    setMessage,
    quantity,
    rows,
    changeTable,
    emptyCart,
    addProduct,
  };
}
