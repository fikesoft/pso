import { useState } from 'react';
import { Button, PageTitle } from '@pos/ui';
import { cashShiftMessages as text } from '@pos/ui/locales';
import { CashRecovery, useCashCommandRecovery } from '../../../entities/cash-command';
import { useShiftList } from '../model/use-shift-list';
import { useShiftDetail } from '../model/use-shift-detail';
import { useShiftCommand } from '../model/use-shift-command';
import type { CashShiftManagementProps, ShiftDialogMode } from '../model/shift-management.types';
import { ShiftList } from './shift-list';
import { ShiftDialog } from './shift-dialog';
export function CashShiftManagement(props: CashShiftManagementProps) {
  const [selectedId, setSelectedId] = useState('');
  const [dialog, setDialog] = useState<ShiftDialogMode>(null);
  const list = useShiftList(props);
  const detail = useShiftDetail(props, selectedId);
  const canRead = props.can('cash.registers.read') && props.can('cash.shifts.read');
  const canOpen = canRead && props.can('cash.shifts.open');
  const canClose = canRead && props.can('cash.shifts.close');
  const canMove = canRead && props.can('cash.movements.create');
  const recovery = useCashCommandRecovery({
    ...props,
    channel: 'CASH',
    canResolve: (value) =>
      value.kind === 'OPEN'
        ? canOpen
        : value.kind === 'CLOSE'
          ? canClose
          : (value.kind === 'CASH_IN' || value.kind === 'CASH_OUT') && canMove,
    onResolved: async () => {
      setDialog(null);
      await list.refresh();
      await detail.refresh();
    },
  });
  const command = useShiftCommand({
    api: props.api,
    isExternallyBlocked: props.isExternallyBlocked,
    recovery,
    enabled: canOpen || canClose || canMove,
    canSend: (kind) => (kind === 'OPEN' ? canOpen : kind === 'CLOSE' ? canClose : canMove),
    onSaved: async (shiftId) => {
      setDialog('DETAIL');
      setSelectedId(shiftId);
      await list.refresh();
      if (selectedId === shiftId) await detail.refresh();
    },
  });
  const mayClose =
    canClose &&
    detail.data?.shift.status === 'OPEN' &&
    (detail.data.shift.ownerUserId === props.actorUserId ||
      (props.can('cash.shifts.close-others') && props.can('cash.reports.read')));
  const mayMove =
    canMove &&
    detail.data?.shift.status === 'OPEN' &&
    detail.data.shift.ownerUserId === props.actorUserId;
  async function refreshDetail() {
    command.reset();
    setDialog(dialog === 'OPEN' ? null : 'DETAIL');
    await detail.refresh();
    await list.refresh();
  }
  if (!canRead) return null;
  return (
    <section className="form-stack">
      <PageTitle title={text.title} description={text.description}>
        {canOpen && (
          <Button
            disabled={recovery.blocked || command.busy || !!props.externalBlocked}
            onClick={() => {
              command.reset();
              setDialog('OPEN');
            }}
          >
            {text.open}
          </Button>
        )}
      </PageTitle>
      {!dialog && <CashRecovery model={recovery} />}
      <ShiftList
        model={list}
        canReport={props.can('cash.reports.read')}
        disabled={recovery.blocked || command.busy || !!props.externalBlocked}
        onOpen={(id) => {
          command.reset();
          setSelectedId(id);
          setDialog('DETAIL');
        }}
      />
      <ShiftDialog
        props={props}
        mode={dialog}
        setMode={setDialog}
        detail={detail}
        command={command}
        mayClose={!!mayClose}
        mayMove={!!mayMove}
        onRefresh={refreshDetail}
      />
    </section>
  );
}
