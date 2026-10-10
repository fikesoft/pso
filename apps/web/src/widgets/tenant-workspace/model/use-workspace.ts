import { useMobileNavigation } from './use-mobile-navigation';
import { canOpenCashier } from '../lib/cashier-access';
import { roMessages, normalizePinInput } from '@pos/ui';
import type { Context } from '@pos/ui/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { errorMessage } from '@pos/ui/api';
import { useDispatch, useSelector } from 'react-redux';
import { clearWorkspace, setContext, setView } from '../../../entities/workspace';
import type { RootState, IssuedCredential } from '../../../entities/workspace';
import type { WorkspaceInput, WorkspaceModal } from './workspace-input.types';
import { useWorkspaceCollections } from './use-workspace-collections';
import {
  readContext,
  resetStaffPassword,
  resetStaffPin,
  revokeDelegation,
  removeStaffAccess,
} from '../api/workspace';
import { workspaceNavigation } from '../config/navigation.constants';
export function useWorkspace({ session, api, logout, invalidateRevoked }: WorkspaceInput) {
  const dispatch = useDispatch();
  const { view, locationId } = useSelector((s: RootState) => s.workspace);
  const [context, setContextData] = useState<Context | null>(null);
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationRefs = useMobileNavigation({ open: mobileOpen, setOpen: setMobileOpen });
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<WorkspaceModal | null>(null);
  const [credential, setCredential] = useState<IssuedCredential | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const contextRequestVersion = useRef(0);
  const contextMounted = useRef(false);
  const loadContext = useCallback(async () => {
    const version = ++contextRequestVersion.current;
    try {
      const { data } = await readContext(api);
      if (!contextMounted.current || version !== contextRequestVersion.current) return null;
      setContextData(data);
      return data;
    } catch (error) {
      if (!contextMounted.current || version !== contextRequestVersion.current) return null;
      throw error;
    }
  }, [api]);
  useEffect(() => {
    contextMounted.current = true;
    let cancelled = false;
    void loadContext()
      .then((data) => {
        if (!cancelled && data)
          dispatch(setContext({ organizationId: data.organization.id, locationId: '' }));
      })
      .catch((error) => {
        if (!cancelled) setError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      contextMounted.current = false;
      contextRequestVersion.current++;
      dispatch(clearWorkspace());
    };
  }, [dispatch, loadContext]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const yes = () => setOnline(true);
    const no = () => setOnline(false);
    window.addEventListener('online', yes);
    window.addEventListener('offline', no);
    return () => {
      window.removeEventListener('online', yes);
      window.removeEventListener('offline', no);
    };
  }, []);
  const can = useCallback(
    (permission: string) => {
      if (!permission) return true;
      if (context?.user.isPrimaryAdmin) return true;
      return !!context?.permissions.some((p) =>
        typeof p === 'string'
          ? p === permission
          : (p.permission === permission || p.key === permission) &&
            p.canUse !== false &&
            (!locationId || p.scopeType === 'ORGANIZATION' || p.locationId === locationId),
      );
    },
    [context, locationId],
  );
  const canNavigate = useCallback(
    (id: string, permission: string) =>
      id === 'customers'
        ? context?.user.isPrimaryAdmin === true ||
          !!context?.permissions.some(
            (p) =>
              typeof p !== 'string' &&
              (p.permission === permission || p.key === permission) &&
              p.scopeType === 'ORGANIZATION' &&
              p.canUse !== false,
          )
        : id === 'cashier'
          ? canOpenCashier(can)
          : id === 'couriers'
            ? ['couriers.read', 'couriers.availability'].some(can)
            : id === 'courier-work'
              ? can('orders.read') && can('delivery.update')
              : id === 'attendance'
                ? ['attendance.clock', 'attendance.read'].some(can)
                : id === 'inventory'
                  ? ['inventory.read', 'inventory.manage', 'inventory.recipes.manage'].some(can)
                  : id === 'website-delivery'
                    ? context?.user.isPrimaryAdmin === true || can('orders.read')
                    : id === 'catalog'
                      ? can('catalog.read') || can('catalog.manage') || can('orders.create')
                      : id === 'orders' || id === 'operator'
                        ? can('orders.read') || can('orders.create')
                        : id === 'staff'
                          ? [
                              'staff.read',
                              'staff.create',
                              'staff.manage',
                              'staff.credentials.reset',
                            ].some(can)
                          : id === 'roles'
                            ? can('roles.read') || can('staff.create')
                            : id === 'kitchen'
                              ? can('kitchen.read') || can('kitchen.alerts.manage')
                              : can(permission),
    [can, context],
  );
  const collections = useWorkspaceCollections({ api, context, view, locationId, can });
  const { users, roles, grants, audit, catalog, loading, setLoading, error, setError, loadView } =
    collections;
  function navigate(id: string) {
    setQuery('');
    setNotice('');
    setError('');
    setCredential(null);
    setModal(null);
    dispatch(setView(id));
    setMobileOpen(false);
  }
  function changeLocation(id: string) {
    dispatch(setContext({ organizationId: context!.organization.id, locationId: id }));
    setCredential(null);
    setModal(null);
    setQuery('');
    setNotice('');
  }
  async function saved() {
    setModal(null);
    setNotice(roMessages.message162);
    try {
      await loadContext();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function exit() {
    setError('');
    try {
      await logout();
      dispatch(clearWorkspace());
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function revokedExit() {
    invalidateRevoked();
    dispatch(clearWorkspace());
  }
  async function sensitive() {
    if (!modal) return;
    setBusy(true);
    setModalError('');
    try {
      if (modal.kind === 'reset') {
        const { data } = await resetStaffPassword(api, modal.value!.id);
        setCredential({ kind: 'PASSWORD', value: data.temporaryPassword });
      }
      if (modal.kind === 'reset-pin') {
        const pin = normalizePinInput(
          (document.getElementById('reset-pin-value') as HTMLInputElement)?.value.trim() || '',
        );
        const { data } = await resetStaffPin(api, modal.value!.id, pin);
        setCredential({ kind: 'PIN', value: data.pin });
      }
      if (modal.kind === 'revoke') {
        const reason = (document.getElementById('revoke-reason') as HTMLInputElement)?.value || '';
        await revokeDelegation(api, modal.value!.id, reason);
      }
      await saved();
    } catch (e) {
      setModalError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const name = context?.organization.name || session.organization?.name || roMessages.message087;
  const actor = { ...session.user!, ...context?.user, mfaEnrolled: session.user!.mfaEnrolled };
  const locations = context?.locations || [];
  const shownLocations = locations.filter(
    (l) =>
      (!locationId || l.id === locationId) &&
      `${l.name} ${l.code}`.toLowerCase().includes(query.toLowerCase()),
  );
  const shownUsers = users.filter((u) =>
    `${u.displayName} ${u.login}`.toLowerCase().includes(query.toLowerCase()),
  );
  const labelPermission = (key: string) => catalog.find((p) => p.key === key)?.label || key;
  const locationName = (id?: string) =>
    id ? locations.find((l) => l.id === id)?.name || roMessages.message163 : roMessages.message081;
  const allowed = canNavigate(
    view,
    workspaceNavigation.find((n) => n.id === view)?.permission || '',
  );
  async function removeAccess() {
    if (!modal?.value) return;
    setBusy(true);
    setModalError('');
    try {
      const [operation, id] = modal.kind.split(':');
      await removeStaffAccess(
        api,
        modal.value.id,
        operation === 'remove-assignment' ? 'assignments' : 'overrides',
        id,
      );
      await saved();
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return {
    ...navigationRefs,
    session,
    api,
    view,
    locationId,
    context,
    loading,
    error,
    notice,
    online,
    mobileOpen,
    setMobileOpen,
    query,
    setQuery,
    users,
    roles,
    grants,
    audit,
    catalog,
    modal,
    setModal,
    credential,
    setCredential,
    busy,
    modalError,
    setModalError,
    loadContext,
    setError,
    can,
    canNavigate,
    loadView,
    navigate,
    changeLocation,
    saved,
    exit,
    revokedExit,
    sensitive,
    name,
    actor,
    locations,
    shownLocations,
    shownUsers,
    labelPermission,
    locationName,
    allowed,
    removeAccess,
  };
}
