import { Button, Loading, Notice, PageTitle } from '@pos/ui';
import { cashDiscrepancyMessages as text } from '@pos/ui/locales';
import { useCashDiscrepancies } from '../model/use-cash-discrepancies';
import type { CashDiscrepancyProps } from '../model/cash-discrepancy.types';
import { DiscrepancyFilters } from './discrepancy-filters';
import { DiscrepancyCard } from './discrepancy-card';
export function CashDiscrepancyReport(props: CashDiscrepancyProps) {
  const model = useCashDiscrepancies(props);
  if (!props.allowed) return null;
  return (
    <section className="form-stack">
      <PageTitle title={text.title} description={text.description} />
      <DiscrepancyFilters model={model} />
      {!model.query && <p>{text.choose}</p>}
      {model.loading && <Loading />}
      {model.denied && <Notice>{text.denied}</Notice>}
      {model.error && <Notice>{model.error}</Notice>}
      {model.data && (
        <>
          <p>
            {text.applied}: {model.query?.closedFrom} — {model.query?.closedTo} · {text.timezone}:{' '}
            {model.data.timezone}
          </p>
          <p>
            {model.query?.discrepancy === 'NONZERO' ? text.nonzero : text.all} ·{' '}
            {model.query?.registerId ? text.selectedRegister : text.allRegisters}
          </p>
          <p>
            {text.loaded}: {model.data.closings.length}
          </p>
          {!model.data.closings.length && <p>{text.empty}</p>}
          {model.data.closings.map((row) => (
            <DiscrepancyCard key={row.closing.id} row={row} timezone={model.data!.timezone} />
          ))}
        </>
      )}
      {model.query && (
        <div className="form-footer">
          <Button variant="secondary" disabled={model.loading} onClick={() => void model.refresh()}>
            {text.refresh}
          </Button>
          {model.data?.nextCursor && (
            <Button variant="secondary" disabled={model.loading} onClick={() => void model.more()}>
              {text.more}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
