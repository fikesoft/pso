import { Badge, Button, Empty, Loading } from '@pos/ui';
import { customerManagementMessages as text } from '@pos/ui/locales';
import type { CustomerDirectoryProps } from '../model/customer-management.types';
export function CustomerList({ model }: CustomerDirectoryProps) {
  const { list } = model;
  if (list.loading) return <Loading />;
  if (list.error) return null;
  if (!list.data?.customers.length)
    return <Empty title={text.empty} description={text.emptyHint} />;
  return (
    <section className="panel">
      <table className="data-table">
        <thead>
          <tr>
            <th>{text.name}</th>
            <th>{text.phone}</th>
            <th>{text.status}</th>
            <th aria-label={text.detail} />
          </tr>
        </thead>
        <tbody>
          {list.data.customers.map((customer) => (
            <tr key={customer.id}>
              <td>
                <strong>{customer.name || text.noName}</strong>
              </td>
              <td data-label={text.phone}>{customer.phone}</td>
              <td data-label={text.status}>
                <Badge tone={customer.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {customer.status === 'ACTIVE' ? text.activeProfile : text.archivedProfile}
                </Badge>
              </td>
              <td className="actions-cell">
                <Button
                  variant="ghost"
                  disabled={model.locked}
                  onClick={() => model.setSelected(customer.id)}
                >
                  {text.detail}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data.nextCursor && (
        <Button variant="secondary" disabled={model.locked} onClick={() => void model.more()}>
          {text.more}
        </Button>
      )}
    </section>
  );
}
