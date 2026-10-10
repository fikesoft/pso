import { Button, Field, Select } from '@pos/ui';
import { customerManagementMessages as text } from '@pos/ui/locales';
import type { CustomerDirectoryProps } from '../model/customer-management.types';
export function CustomerFilters({ model }: CustomerDirectoryProps) {
  return (
    <form
      className="form-stack panel panel-body"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const query = String(data.get('query') ?? '').trim();
        model.changeQuery({
          status: model.query.status,
          ...(query ? { field: data.get('field') === 'PHONE' ? 'PHONE' : 'NAME', query } : {}),
        });
      }}
    >
      <Select
        label={text.status}
        value={model.query.status}
        disabled={model.pending}
        onChange={(event) =>
          model.changeQuery({
            ...model.query,
            status: event.target.value as 'ACTIVE' | 'ARCHIVED' | 'ALL',
          })
        }
      >
        <option value="ACTIVE">{text.active}</option>
        <option value="ARCHIVED">{text.archived}</option>
        <option value="ALL">{text.all}</option>
      </Select>
      <Select label={text.field} name="field" defaultValue="PHONE" disabled={model.pending}>
        <option value="PHONE">{text.phone}</option>
        <option value="NAME">{text.name}</option>
      </Select>
      <Field
        label={text.query}
        name="query"
        maxLength={160}
        disabled={model.pending}
        autoComplete="off"
      />
      <small>{text.searchHint}</small>
      <div className="inline">
        <Button type="submit" disabled={model.pending}>
          {text.search}
        </Button>
        <Button
          type="reset"
          variant="secondary"
          disabled={model.pending}
          onClick={() => model.changeQuery({ status: model.query.status })}
        >
          {text.clear}
        </Button>
      </div>
    </form>
  );
}
