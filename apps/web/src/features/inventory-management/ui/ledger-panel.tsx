import { useCallback, useState } from 'react';
import { Badge, Button, Empty, Loading, Notice, Select } from '@pos/ui';
import { inventoryMessages as text, operationalMessages } from '@pos/ui/locales';
import type { InventoryDocumentKind } from '@pos/contracts';
import { useRemoteData } from '../../../shared/lib';
import { readInventoryMovements } from '../api/inventory.api';
import { MOVEMENT_LABELS, INVENTORY_UNIT_SYMBOLS } from '../config/inventory.constants';
import { inventoryTimestamp } from '../lib/presentation';
import type { InventoryComponentProps } from '../model/inventory.types';
export function LedgerPanel({ model }: InventoryComponentProps) {
  const [inventoryItemId, setItemId] = useState('');
  const [kind, setKind] = useState<InventoryDocumentKind | ''>('');
  const load = useCallback(
    () => readInventoryMovements(model.api, model.locationId, { inventoryItemId, kind }),
    [model.api, model.locationId, inventoryItemId, kind],
  );
  const ledger = useRemoteData(load);
  async function more() {
    const cursor = ledger.data?.nextCursor;
    if (cursor)
      await ledger.append(
        () =>
          readInventoryMovements(model.api, model.locationId, { inventoryItemId, kind }, cursor),
        (current, page) => ({ ...page, movements: [...current.movements, ...page.movements] }),
      );
  }
  return (
    <section>
      <div className="inventory-filters">
        <Select
          label={text.item}
          value={inventoryItemId}
          onChange={(event) => setItemId(event.target.value)}
        >
          <option value="">{text.allItems}</option>
          {model.items.data?.items.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select
          label={text.movementKind}
          value={kind}
          onChange={(event) => setKind(event.target.value as InventoryDocumentKind | '')}
        >
          <option value="">{text.allKinds}</option>
          {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {model.items.data?.nextCursor && (
        <Button
          variant="secondary"
          busy={model.items.loadingMore}
          onClick={() => void model.moreItems()}
        >
          {text.moreItems}
        </Button>
      )}
      <Button variant="secondary" busy={ledger.loading} onClick={() => void ledger.refresh()}>
        {operationalMessages.refresh}
      </Button>
      {ledger.error && <Notice>{ledger.error}</Notice>}
      {ledger.loading ? (
        <Loading />
      ) : !ledger.data?.movements.length ? (
        <Empty title={text.noMovements} description={text.description} />
      ) : (
        <div className="inventory-ledger">
          {ledger.data.movements.map((entry) => (
            <article className="inventory-card" key={entry.id}>
              <div className="operation-card-heading">
                <h3>{entry.itemName}</h3>
                <Badge>{MOVEMENT_LABELS[entry.document.kind]}</Badge>
              </div>
              <p>
                <strong>
                  {entry.quantity} {INVENTORY_UNIT_SYMBOLS[entry.unit]}
                </strong>{' '}
                · {entry.itemSku}
              </p>
              <dl>
                <dt>{text.why}</dt>
                <dd>{entry.document.reason}</dd>
                <dt>{text.who}</dt>
                <dd>{entry.document.actorName}</dd>
                <dt>{text.when}</dt>
                <dd>{inventoryTimestamp(entry.document.createdAt)}</dd>
                <dt>{text.source}</dt>
                <dd>
                  {entry.document.orderNumber !== null
                    ? `${operationalMessages.orderNumber} #${entry.document.orderNumber}`
                    : text.manualSource}
                  {entry.productName ? ` · ${entry.productName}` : ''}
                </dd>
                {entry.countedQuantity !== null && (
                  <>
                    <dt>{text.countedQuantity}</dt>
                    <dd>
                      {entry.countedQuantity} {INVENTORY_UNIT_SYMBOLS[entry.unit]}
                    </dd>
                  </>
                )}
              </dl>
            </article>
          ))}
        </div>
      )}
      {ledger.data?.nextCursor && (
        <Button variant="secondary" busy={ledger.loadingMore} onClick={() => void more()}>
          {operationalMessages.more}
        </Button>
      )}
    </section>
  );
}
