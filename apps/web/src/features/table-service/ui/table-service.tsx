import { useState } from 'react';
import { Button, PageTitle } from '@pos/ui';
import { tableMessages as text } from '@pos/ui/locales';
import type { TableServiceProps } from '../model/table-service.types';
import { TableMap } from './table-map';
import { TableConfiguration } from './table-configuration';
import { VisitPanel } from './visit-panel';
export function TableService(props: TableServiceProps) {
  const [visit, setVisit] = useState<string>();
  const [configuration, setConfiguration] = useState(false);
  return (
    <section className="form-stack">
      <PageTitle title={text.title} description={text.description} />
      {!visit && !configuration && props.can('tables.manage') && (
        <Button variant="secondary" disabled={props.blocked} onClick={() => setConfiguration(true)}>
          {text.configuration}
        </Button>
      )}
      {configuration && props.can('tables.manage') ? (
        <TableConfiguration {...props} onBack={() => setConfiguration(false)} />
      ) : visit ? (
        <VisitPanel
          onVisit={setVisit}
          key={visit}
          {...props}
          id={visit}
          onBack={() => setVisit(undefined)}
        />
      ) : (
        <TableMap {...props} onSelect={setVisit} />
      )}
    </section>
  );
}
