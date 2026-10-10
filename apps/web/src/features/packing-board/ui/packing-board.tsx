import { Button, Empty, Loading, Notice, PageTitle } from '@pos/ui';
import { useId } from 'react';
import { packingMessages as text } from '@pos/ui/locales';
import type { PackingBoardFilter } from '@pos/contracts';
import { PACKING_FILTERS } from '../config/packing.constants';
import { usePackingBoard } from '../model/use-packing-board';
import type { PackingBoardProps } from '../model/packing-board.types';
import { PackingCard } from './packing-card';
import { PackingRecovery } from './packing-recovery';
export function PackingBoard(props: PackingBoardProps) {
  const filterId = useId();
  const model = usePackingBoard(props);
  const { board, operation } = model;
  return (
    <section>
      <PageTitle title={text.title} eyebrow={props.locationName} description={text.description}>
        <Button
          variant="secondary"
          busy={operation.busy || board.loading}
          disabled={operation.recovering}
          onClick={() => void model.refresh()}
        >
          {text.refresh}
        </Button>
      </PageTitle>
      <p className="section-note">
        {text.actor}: {props.actorName}
      </p>
      <div className="packing-filter">
        <label htmlFor={filterId}>{text.filter}</label>
        <select
          id={filterId}
          value={model.filter}
          disabled={operation.busy || operation.recovering || board.loading}
          onChange={(event) => model.selectFilter(event.target.value as PackingBoardFilter)}
        >
          {PACKING_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </div>
      {board.error && <Notice>{board.error}</Notice>}
      <PackingRecovery operation={operation} />
      {board.loading ? (
        <Loading />
      ) : !board.data?.sessions.length ? (
        <Empty title={text.empty} description={text.emptyHint} />
      ) : (
        <div className="packing-board">
          {board.data.sessions.map((session) => (
            <PackingCard
              key={session.id}
              session={session}
              locked={model.locked}
              canUpdate={props.can('packing.update')}
              canComplete={props.can('packing.complete')}
              send={operation.send}
            />
          ))}
        </div>
      )}
      {board.data?.nextCursor && (
        <Button variant="secondary" disabled={model.locked} onClick={() => void model.more()}>
          {text.more}
        </Button>
      )}
    </section>
  );
}
