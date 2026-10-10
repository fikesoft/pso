import { Button, Loading, Notice, Select } from '@pos/ui';
import { customerHistoryMessages as text } from '@pos/ui/locales';
import type { OrderStatus } from '@pos/contracts';
import { ORDER_STATUS_LABELS } from '../../../shared/config/operations.constants';
import type { CustomerHistoryProps } from '../model/customer-history.types';
import { useCustomerHistory } from '../model/use-customer-history';
import { CustomerHistoryCard } from './customer-history-card';

export function CustomerHistory(props: CustomerHistoryProps) {
  const model = useCustomerHistory(props);
  const { list } = model;
  return (
    <section className="form-stack" aria-label={text.title}>
      <h3>{text.title}</h3>
      <p className="section-note">{text.description}</p>
      <Select
        label={text.filter}
        value={model.status}
        disabled={list.loading}
        onChange={(event) => model.filter(event.target.value as OrderStatus | '')}
      >
        <option value="">{text.all}</option>
        {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Button variant="secondary" disabled={list.loading} onClick={() => void model.refresh()}>
        {text.refresh}
      </Button>
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <Notice>{list.error}</Notice>
      ) : (
        <>
          {!list.data?.orders.length && <p>{text.empty}</p>}
          {list.data?.orders.map((order) => (
            <CustomerHistoryCard key={order.id} order={order} />
          ))}
          {list.data?.nextCursor && (
            <Button variant="secondary" onClick={() => void model.refresh(true)}>
              {text.more}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
