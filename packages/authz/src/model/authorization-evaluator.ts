import { supportsPermissionLimits } from '../lib/permission-limits.js';
import { getPermission } from '../catalog.js';
import { limitsWithin, validLimits } from '../lib/decimal.js';
import type {
  AllowSource,
  AuthorizationSnapshot,
  AuthzUser,
  DelegationGrant,
  Limits,
  Scope,
} from './authorization.types.js';

/** Internal evaluation machinery shared by use, grant, management and provenance checks. */
export class AuthorizationEvaluator {
  constructor(protected readonly snapshot: AuthorizationSnapshot) {}

  protected resolveUser(target: string | AuthzUser): AuthzUser | undefined {
    const user =
      typeof target === 'string'
        ? this.snapshot.users.find((entry) => entry.id === target)
        : target;
    return user?.organizationId === this.snapshot.organizationId ? user : undefined;
  }
  protected activeUser(id: string): AuthzUser | undefined {
    const user = this.resolveUser(id);
    return user?.status === 'ACTIVE' ? user : undefined;
  }
  protected isPrimary(user: AuthzUser): boolean {
    return user.id === this.snapshot.primaryAdminUserId;
  }
  protected canManageRelationship(actor: AuthzUser, target: AuthzUser): boolean {
    if (
      actor.id === target.id ||
      this.isPrimary(target) ||
      target.organizationId !== actor.organizationId
    )
      return false;
    if (this.isPrimary(actor)) return true;
    return (
      target.managedByUserId === actor.id &&
      !this.snapshot.delegations.some(
        (grant) => grant.userId === target.id && grant.status === 'ACTIVE',
      )
    );
  }
  private validScope(scope: Scope): boolean {
    if (scope.organizationId !== this.snapshot.organizationId) return false;
    if (scope.scopeType === 'ORGANIZATION')
      return scope.locationId === undefined || scope.locationId === null;
    return (
      scope.scopeType === 'LOCATION' &&
      !!scope.locationId &&
      this.snapshot.locations.some(
        (location) =>
          location.id === scope.locationId &&
          location.organizationId === scope.organizationId &&
          location.status === 'ACTIVE',
      )
    );
  }
  protected canAccessScope(user: AuthzUser, scope: Scope): boolean {
    return (
      user.organizationId === this.snapshot.organizationId &&
      this.validScope(scope) &&
      (scope.scopeType === 'ORGANIZATION' ||
        this.isPrimary(user) ||
        user.locationIds.includes(scope.locationId!))
    );
  }
  private sameScope(source: Scope, requested: Scope): boolean {
    return (
      this.validScope(source) &&
      source.organizationId === requested.organizationId &&
      source.scopeType === requested.scopeType &&
      (source.locationId ?? null) === (requested.locationId ?? null)
    );
  }
  private hasDeny(actorId: string, action: string, scope: Scope): boolean {
    return this.snapshot.overrides.some(
      (override) =>
        override.userId === actorId &&
        override.permission === action &&
        override.effect === 'DENY' &&
        !override.revokedAt &&
        override.organizationId === scope.organizationId &&
        this.validScope(override) &&
        (override.scopeType === 'ORGANIZATION' || this.sameScope(override, scope)),
    );
  }
  protected validDelegation(grant: DelegationGrant, beneficiaryId: string, scope: Scope): boolean {
    return (
      grant.userId === beneficiaryId &&
      grant.status === 'ACTIVE' &&
      !grant.parentGrantId &&
      !grant.canRedelegate &&
      grant.issuerUserId === this.snapshot.primaryAdminUserId &&
      !!this.activeUser(grant.issuerUserId) &&
      !!this.activeUser(beneficiaryId) &&
      this.sameScope(grant, scope)
    );
  }
  protected hasAuthorityWithin(
    actorId: string,
    action: string,
    scope: Scope,
    limits: Limits,
    seen: ReadonlySet<string>,
  ): boolean {
    return (
      supportsPermissionLimits(action, limits) &&
      this.allowSources(actorId, action, scope, seen).some((source) =>
        limitsWithin(limits, source.limits),
      )
    );
  }
  private validProvenance(
    source: AllowSource,
    recipient: AuthzUser,
    action: string,
    scope: Scope,
    seen: ReadonlySet<string>,
  ): boolean {
    const issuer = this.activeUser(source.issuerUserId);
    if (
      !issuer ||
      issuer.id === recipient.id ||
      !validLimits(source.limits) ||
      !supportsPermissionLimits(action, source.limits)
    )
      return false;
    if (this.isPrimary(issuer)) return !source.delegationGrantId;
    if (
      !source.delegationGrantId ||
      !getPermission(action)?.delegable ||
      !this.canManageRelationship(issuer, recipient) ||
      !this.canAccessScope(issuer, scope)
    )
      return false;
    const grant = this.snapshot.delegations.find((entry) => entry.id === source.delegationGrantId);
    return (
      !!grant &&
      this.validDelegation(grant, issuer.id, scope) &&
      grant.permissions.some(
        (entry) =>
          entry.permission === action &&
          supportsPermissionLimits(action, entry.limits) &&
          limitsWithin(source.limits, entry.limits),
      ) &&
      this.hasAuthorityWithin(issuer.id, action, scope, source.limits ?? {}, seen)
    );
  }
  protected allowSources(
    actorId: string,
    action: string,
    scope: Scope,
    seen: ReadonlySet<string>,
  ): AllowSource[] {
    const actor = this.activeUser(actorId);
    const permission = getPermission(action);
    if (
      !actor ||
      !permission ||
      !permission.scopeTypes.includes(scope.scopeType) ||
      !this.canAccessScope(actor, scope) ||
      this.hasDeny(actorId, action, scope) ||
      seen.has(actorId)
    )
      return [];
    if (this.isPrimary(actor))
      return [{ id: 'primary', permission: action, issuerUserId: actor.id }];
    if (!permission.delegable) return [];
    const nextSeen = new Set(seen).add(actorId);
    const sources: AllowSource[] = [];
    for (const assignment of this.snapshot.assignments) {
      if (
        assignment.userId !== actorId ||
        assignment.revokedAt ||
        !this.sameScope(assignment, scope)
      )
        continue;
      const role = this.snapshot.roleVersions.find(
        (entry) =>
          entry.id === assignment.roleVersionId && entry.organizationId === scope.organizationId,
      );
      for (const entry of role?.permissions ?? [])
        if (entry.permission === action) sources.push({ ...assignment, ...entry });
    }
    for (const override of this.snapshot.overrides) {
      if (
        override.userId === actorId &&
        override.effect === 'ALLOW' &&
        override.permission === action &&
        !override.revokedAt &&
        this.sameScope(override, scope)
      )
        sources.push(override);
    }
    return sources.filter((source) => this.validProvenance(source, actor, action, scope, nextSeen));
  }
}
