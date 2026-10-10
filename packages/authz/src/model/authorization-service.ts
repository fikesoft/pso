import { supportsPermissionLimits } from '../lib/permission-limits.js';
import { getPermission, PERMISSIONS } from '../catalog.js';
import { decimalAtMost, decimalUnits, limitsWithin, validLimits } from '../lib/decimal.js';
import type {
  AuthzUser,
  GrantDecision,
  Limits,
  ManageOperation,
  PermissionEntry,
  ResourceContext,
  Scope,
} from './authorization.types.js';

import { MANAGE_PERMISSIONS, NO_GRANT } from '../config/authorization.constants.js';
import { AuthorizationEvaluator } from './authorization-evaluator.js';
/** Deny-by-default, no database/network access and no mutable session permission cache. */
export class AuthorizationService extends AuthorizationEvaluator {
  canUse(actorId: string, action: string, context: ResourceContext): boolean {
    if (
      (context.amount !== undefined && decimalUnits(context.amount) === null) ||
      (context.percent !== undefined && !decimalAtMost(context.percent, '100'))
    )
      return false;
    return this.allowSources(actorId, action, context, new Set()).some(
      (entry) =>
        (context.amount === undefined ||
          entry.limits?.maxAmount === undefined ||
          decimalAtMost(context.amount, entry.limits.maxAmount)) &&
        (context.percent === undefined ||
          entry.limits?.maxPercent === undefined ||
          decimalAtMost(context.percent, entry.limits.maxPercent)),
    );
  }

  canGrant(
    actorId: string,
    target: string | AuthzUser,
    permission: string,
    scope: Scope,
    limits: Limits = {},
  ): boolean {
    return this.grantSource(actorId, target, permission, scope, limits).allowed;
  }

  /** Persist this exact grant id on each derived assignment/ALLOW; never accept it from the client. */
  grantSource(
    actorId: string,
    target: string | AuthzUser,
    permission: string,
    scope: Scope,
    limits: Limits = {},
  ): GrantDecision {
    const actor = this.activeUser(actorId);
    const recipient = this.resolveUser(target);
    const definition = getPermission(permission);
    if (
      !actor ||
      !recipient ||
      !definition?.delegable ||
      !validLimits(limits) ||
      !supportsPermissionLimits(permission, limits) ||
      !this.canAccessScope(actor, scope) ||
      !this.canAccessScope(recipient, scope) ||
      !definition.scopeTypes.includes(scope.scopeType) ||
      !this.canManageRelationship(actor, recipient)
    )
      return NO_GRANT;
    if (!this.hasAuthorityWithin(actorId, permission, scope, limits, new Set())) return NO_GRANT;
    if (this.isPrimary(actor)) return { allowed: true, delegationGrantId: null };
    const delegation = this.snapshot.delegations.find(
      (grant) =>
        this.validDelegation(grant, actorId, scope) &&
        grant.permissions.some(
          (entry) =>
            entry.permission === permission &&
            supportsPermissionLimits(permission, entry.limits) &&
            limitsWithin(limits, entry.limits),
        ),
    );
    return delegation ? { allowed: true, delegationGrantId: delegation.id } : NO_GRANT;
  }

  canManageUser(actorId: string, target: string | AuthzUser, operation: ManageOperation): boolean {
    const actor = this.activeUser(actorId);
    const recipient = this.resolveUser(target);
    if (!actor || !recipient || !this.canManageRelationship(actor, recipient)) return false;
    if (this.isPrimary(actor)) return true;
    if (operation === 'setDelegation' || operation === 'removeDeny') return false;
    // A delegated administrator must have authority over every location of the person,
    // preventing an A-scoped password reset from unlocking a person's B access.
    if (recipient.locationIds.length === 0) return false;
    const permission = MANAGE_PERMISSIONS[operation];
    return recipient.locationIds.every((locationId) => {
      const scope: Scope = {
        organizationId: this.snapshot.organizationId,
        scopeType: 'LOCATION',
        locationId,
      };
      if (!this.canAccessScope(actor, scope)) return false;
      const organizationScope: Scope = {
        organizationId: this.snapshot.organizationId,
        scopeType: 'ORGANIZATION',
      };
      if (
        this.canUse(actorId, permission, scope) ||
        this.canUse(actorId, permission, organizationScope)
      )
        return true;
      if (operation === 'read')
        return ['staff.create', 'staff.manage', 'staff.credentials.reset'].some(
          (key) => this.canUse(actorId, key, scope) || this.canUse(actorId, key, organizationScope),
        );
      // An explicit grant ceiling authorizes assigning its contents even when the
      // administrator has only staff.create, as in the required Ana scenario.
      return (
        operation === 'assignPermissions' &&
        this.snapshot.delegations.some(
          (grant) =>
            this.validDelegation(grant, actorId, scope) &&
            grant.permissions.some((entry) =>
              this.hasAuthorityWithin(
                actorId,
                entry.permission,
                scope,
                entry.limits ?? {},
                new Set(),
              ),
            ),
        )
      );
    });
  }

  /** Only the primary administrator can create/revoke ceilings; re-delegation stays closed. */
  canSetDelegation(
    actorId: string,
    target: string | AuthzUser,
    scope: Scope,
    entries: readonly PermissionEntry[],
  ): boolean {
    const actor = this.activeUser(actorId);
    return (
      !!actor &&
      this.isPrimary(actor) &&
      entries.length > 0 &&
      this.canManageUser(actorId, target, 'setDelegation') &&
      entries.every((entry) =>
        this.canGrant(actorId, target, entry.permission, scope, entry.limits),
      )
    );
  }

  requiresMfa(actorId: string): boolean {
    const actor = this.activeUser(actorId);
    if (!actor) return true;
    if (this.isPrimary(actor)) return true;
    const scopes: Scope[] = [
      { organizationId: actor.organizationId, scopeType: 'ORGANIZATION' },
      ...actor.locationIds.map((locationId) => ({
        organizationId: actor.organizationId,
        scopeType: 'LOCATION' as const,
        locationId,
      })),
    ];
    return scopes.some(
      (scope) =>
        this.snapshot.delegations.some((grant) => this.validDelegation(grant, actorId, scope)) ||
        PERMISSIONS.some(
          (permission) => permission.privileged && this.canUse(actorId, permission.key, scope),
        ),
    );
  }

  explainUse(actorId: string, action: string, scope: Scope): readonly string[] {
    return this.allowSources(actorId, action, scope, new Set()).map((source) =>
      source.id === 'primary'
        ? 'Administrator principal al companiei'
        : `${source.id}; emitent ${source.issuerUserId}${source.delegationGrantId ? `; delegare ${source.delegationGrantId}` : '; acordare directă'}`,
    );
  }
}
