import { useCallback, useMemo, useState } from 'react';
import { Button, Loading, Notice, Select } from '@pos/ui';
import { kitchenAlertMessages as text, cashRecoveryMessages as recovery } from '@pos/ui/locales';
import type { KitchenAlertScope, KitchenAlertTarget } from '@pos/contracts/kitchen-alerts';
import { readAlert, useAlertOperation } from '../../../entities/kitchen-alert';
import { useRemoteData } from '../../../shared/lib';
import type { AlertConfigurationProps } from '../model/alert.types';
import { AlertTargetPicker } from './alert-target-picker';
import { AlertForm } from './alert-form';

export function AlertConfiguration(props: AlertConfigurationProps) {
  const [scopeType, setScopeType] = useState<KitchenAlertScope['scopeType']>(
    props.canManageLocation ? 'LOCATION' : 'ORGANIZATION',
  );
  const [kind, setKind] = useState<KitchenAlertTarget['kind']>('DEFAULT');
  const [target, setTarget] = useState<KitchenAlertTarget | null>({ kind: 'DEFAULT' });
  const [revision, setRevision] = useState(0);
  const scope = useMemo<KitchenAlertScope>(
    () => (scopeType === 'LOCATION' ? { scopeType, locationId: props.locationId } : { scopeType }),
    [scopeType, props.locationId],
  );
  const identity = useMemo(() => (target ? { scope, target } : null), [scope, target]);
  const list = useRemoteData(
    useCallback(
      () => (identity ? readAlert(props.api, identity) : Promise.resolve(null)),
      [props.api, identity],
    ),
  );
  const operation = useAlertOperation({
    ...props,
    onSaved: async () => {
      await list.refresh();
      setRevision((value) => value + 1);
    },
  });
  const allowed =
    scopeType === 'ORGANIZATION' ? props.canManageOrganization : props.canManageLocation;
  const data = list.data;
  const matches =
    data &&
    identity &&
    JSON.stringify({ scope: data.rule.scope, target: data.rule.target }) ===
      JSON.stringify(identity);
  const selectedId =
    target?.kind === 'PRODUCT'
      ? target.productId
      : target?.kind === 'CATEGORY'
        ? target.categoryId
        : target?.kind === 'STATION'
          ? target.stationId
          : '';
  const blocked = operation.busy || operation.recovering || !operation.ready;
  async function refresh() {
    if (await list.refresh()) {
      operation.refreshed();
      setRevision((value) => value + 1);
    }
  }
  return (
    <section className="form-stack" aria-label={text.configuration}>
      <Button variant="secondary" disabled={operation.busy} onClick={props.onBack}>
        {text.back}
      </Button>
      <h2>{text.configuration}</h2>
      {operation.error && <Notice>{operation.error}</Notice>}
      {operation.notice && <Notice tone="success">{operation.notice}</Notice>}
      {operation.recovering && (
        <>
          <Notice tone="info">{recovery.recovery}</Notice>
          <div className="inline">
            <Button
              disabled={operation.busy || !operation.canResolve}
              onClick={() => void operation.resolve()}
            >
              {recovery.resolve}
            </Button>
            {operation.hasAttempt && (
              <Button
                disabled={operation.busy || !operation.canResolve}
                onClick={() => void operation.send()}
              >
                {recovery.retry}
              </Button>
            )}
          </div>
        </>
      )}
      <Select
        label={text.scope}
        value={scopeType}
        disabled={blocked}
        onChange={(event) => {
          setScopeType(event.target.value as KitchenAlertScope['scopeType']);
          setKind('DEFAULT');
          setTarget({ kind: 'DEFAULT' });
        }}
      >
        {props.canManageLocation && <option value="LOCATION">{text.location}</option>}
        {props.canManageOrganization && <option value="ORGANIZATION">{text.organization}</option>}
      </Select>
      <Select
        label={text.target}
        value={kind}
        disabled={blocked}
        onChange={(event) => {
          const next = event.target.value as KitchenAlertTarget['kind'];
          setKind(next);
          setTarget(next === 'DEFAULT' ? { kind: 'DEFAULT' } : null);
        }}
      >
        <option value="DEFAULT">{text.defaultTarget}</option>
        {scopeType === 'LOCATION' && <option value="STATION">{text.station}</option>}
        <option value="CATEGORY">{text.category}</option>
        <option value="PRODUCT">{text.product}</option>
      </Select>
      {kind !== 'DEFAULT' && (
        <AlertTargetPicker
          key={`${scopeType}:${kind}`}
          api={props.api}
          scope={scope}
          kind={kind}
          disabled={blocked}
          selectedId={selectedId}
          onSelect={setTarget}
        />
      )}
      {list.error && <Notice>{list.error}</Notice>}
      {list.loading && <Loading />}
      {identity && (
        <Button
          variant="secondary"
          disabled={blocked || list.loading}
          onClick={() => void refresh()}
        >
          {text.refresh}
        </Button>
      )}
      {allowed && matches && !list.loading && !list.error && (
        <AlertForm
          key={`${JSON.stringify(identity)}:${data.rule.version}:${revision}`}
          rule={data.rule}
          preview={data}
          operation={operation}
        />
      )}
    </section>
  );
}
