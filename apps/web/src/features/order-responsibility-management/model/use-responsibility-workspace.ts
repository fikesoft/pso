import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  OrderResponsibilityCommandKind,
  OrderResponsibilityListRequest,
} from '@pos/contracts/order-responsibilities';
import { useResponsibilityCommand } from './use-responsibility-command';
import { useResponsibilityDetail } from './use-responsibility-detail';
import { useResponsibilityList } from './use-responsibility-list';
import { useResponsibilityShifts } from './use-responsibility-shifts';
import type {
  ResponsibilityView,
  ResponsibilityWorkspaceInput,
} from './responsibility-management.types';
export function useResponsibilityWorkspace(input: ResponsibilityWorkspaceInput) {
  const [view, setView] = useState<ResponsibilityView>('UNASSIGNED'),
    [manager, setManager] = useState(false);
  const [form, setForm] = useState<OrderResponsibilityCommandKind | null>(null);
  const allowed =
    input.can('orders.read') && input.can('cash.registers.read') && input.can('cash.shifts.read');
  const managerial = manager && view === 'ASSIGNED';
  const shifts = useResponsibilityShifts(input, view, managerial);
  const query = useMemo<OrderResponsibilityListRequest | null>(() => {
    const base = { locationId: input.locationId, limit: 50 };
    if (view === 'UNASSIGNED') return { ...base, view };
    if (!shifts.selected) return null;
    return view === 'ASSIGNED'
      ? { ...base, view, shiftId: shifts.selected.id }
      : {
          ...base,
          view: 'PENDING',
          shiftId: shifts.selected.id,
          perspective: view === 'INCOMING' ? 'INCOMING' : 'OUTGOING',
        };
  }, [input.locationId, view, shifts.selected?.id]);
  const list = useResponsibilityList(
    input,
    query,
    allowed &&
      (!managerial || (input.can('orders.handoff-others') && input.can('cash.reports.read'))),
  );
  const detail = useResponsibilityDetail(input, allowed);
  const command = useResponsibilityCommand({
    ...input,
    onSaved: async () => {
      setForm(null);
      await Promise.all([list.refresh(), detail.refresh(), input.onSaved()]);
    },
  });
  const active = useRef({ command, form });
  active.current = { command, form };
  useEffect(() => {
    setForm(null);
  }, [input.orderId, command.generation]);
  useEffect(() => {
    if (
      !command.blocked &&
      !command.busy &&
      (input.accessBlocked || !allowed || (!detail.loading && !detail.data))
    )
      setForm(null);
  }, [input.accessBlocked, allowed, detail.loading, detail.data, command.blocked, command.busy]);
  return {
    input,
    allowed,
    view,
    setView,
    manager: managerial,
    setManager,
    shifts,
    query,
    list,
    detail,
    command,
    form,
    isBlocking: () => active.current.command.isBlocking() || !!active.current.form,
    begin: (kind: OrderResponsibilityCommandKind) => {
      if (!command.isBlocking() && !input.isReviewLocked()) {
        command.reset();
        setForm(kind);
      }
    },
    back: () => {
      if (!command.isBlocking()) {
        command.reset();
        setForm(null);
      }
    },
  };
}
