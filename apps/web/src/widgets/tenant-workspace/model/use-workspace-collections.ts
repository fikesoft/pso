import type { Permission, Role, User, AuditEvent, Grant } from '@pos/ui/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { WorkspaceCollectionsInput } from './workspace-collections.types';
import { readUsers, readRoles, readPermissions, readGrants, readAudit } from '../api/workspace';
export function useWorkspaceCollections({
  api,
  context,
  view,
  locationId,
  can,
}: WorkspaceCollectionsInput) {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadVersion = useRef(0);
  const loadView = useCallback(async () => {
    if (!context) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    setUsers([]);
    setRoles([]);
    setGrants([]);
    setAudit([]);
    try {
      const params = locationId ? { locationId } : {};
      const needsUsers =
        ['staff', 'delegations'].includes(view) &&
        ['staff.read', 'staff.create', 'staff.manage', 'staff.credentials.reset'].some(can);
      const needsRoles =
        ['roles', 'staff'].includes(view) && (can('roles.read') || can('staff.create'));
      const jobs: Promise<void>[] = [];
      if (needsUsers)
        jobs.push(
          readUsers(api, params).then((r) => {
            if (version === loadVersion.current) setUsers(r.data.users);
          }),
        );
      if (needsRoles)
        jobs.push(
          readRoles(api, params).then((r) => {
            if (version === loadVersion.current)
              setRoles(
                r.data.roles.map((role) => ({
                  ...role,
                  versions: [...role.versions].sort((a, b) => a.version - b.version),
                })),
              );
          }),
        );
      if (['roles', 'staff', 'delegations', 'access'].includes(view))
        jobs.push(
          readPermissions(api).then((r) => {
            if (version === loadVersion.current) setCatalog(r.data.permissions);
          }),
        );
      if (view === 'delegations' && can('staff.delegate'))
        jobs.push(
          readGrants(api, params).then((r) => {
            if (version === loadVersion.current) setGrants(r.data.grants);
          }),
        );
      if (view === 'audit' && can('audit.read'))
        jobs.push(
          readAudit(api, params).then((r) => {
            if (version === loadVersion.current) setAudit(r.data.events);
          }),
        );
      await Promise.all(jobs);
    } catch (e) {
      if (version === loadVersion.current) setError(errorMessage(e));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [api, context, view, locationId, can]);
  useEffect(() => {
    void loadView();
    return () => {
      loadVersion.current++;
    };
  }, [loadView]);
  return { users, roles, grants, audit, catalog, loading, setLoading, error, setError, loadView };
}
