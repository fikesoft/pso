import { useCallback, useRef, useState } from 'react';
import { OrderResponsibilityWorkspace } from './order-responsibility-workspace';
import { Empty } from '@pos/ui';
import { operationalMessages as text } from '@pos/ui/locales';
import { CashDiscrepancyReport } from '../../../features/cash-discrepancy-report';
import { CashShiftManagement } from '../../../features/cash-shift-management';
import { CashRegisterManagement } from '../../../features/cash-register-management';
import type { WorkspaceComponentProps } from '../model/workspace.types';
export function CashRegisterSection({ model }: WorkspaceComponentProps) {
  const responsibilityGuard = useRef<(() => boolean) | null>(null);
  const [responsibilityBlocked, setResponsibilityBlocked] = useState(false);
  const registerGuard = useCallback((guard: (() => boolean) | null) => {
    responsibilityGuard.current = guard;
  }, []);
  if (!model.locationId || !model.context)
    return <Empty title={text.chooseLocation} description={text.chooseLocationHint} />;
  return (
    <div className="form-stack">
      <CashRegisterManagement
        key={`${model.context.organization.id}:${model.actor.id}:${model.locationId}`}
        organizationId={model.context.organization.id}
        actorUserId={model.actor.id}
        locationId={model.locationId}
        locationName={model.locationName(model.locationId)}
        api={model.api}
        canRead={model.can('cash.registers.read')}
        canManage={model.can('cash.registers.read') && model.can('cash.registers.manage')}
      />
      <CashShiftManagement
        onReviewResponsibilities={() =>
          document
            .getElementById(`order-responsibilities-${model.locationId}`)
            ?.scrollIntoView({ block: 'start' })
        }
        isExternallyBlocked={() => !!responsibilityGuard.current?.()}
        externalBlocked={responsibilityBlocked}
        key={`shifts:${model.context.organization.id}:${model.actor.id}:${model.locationId}`}
        organizationId={model.context.organization.id}
        actorUserId={model.actor.id}
        locationId={model.locationId}
        api={model.api}
        can={model.can}
      />
      <OrderResponsibilityWorkspace
        registerGuard={registerGuard}
        onBlockingChange={setResponsibilityBlocked}
        key={`responsibility:${model.context.organization.id}:${model.actor.id}:${model.locationId}`}
        organizationId={model.context.organization.id}
        actorUserId={model.actor.id}
        locationId={model.locationId}
        api={model.api}
        can={model.can}
      />
      <CashDiscrepancyReport
        key={`discrepancies:${model.context.organization.id}:${model.actor.id}:${model.locationId}`}
        organizationId={model.context.organization.id}
        actorUserId={model.actor.id}
        locationId={model.locationId}
        api={model.api}
        allowed={
          model.can('cash.registers.read') &&
          model.can('cash.shifts.read') &&
          model.can('cash.reports.read')
        }
      />
    </div>
  );
}
