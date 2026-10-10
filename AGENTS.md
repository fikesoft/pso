# POS foundation

Read PROMPT_CODEX_POS_MVP.md completely before changing architecture.

- Romanian UI/documentation; English identifiers. pnpm monorepo, Next/Express/Prisma/PostgreSQL.
- No deploy, git staging/commits, firewall changes, cloud resources, destructive reset or volume deletion.
- Personal data and repository contents stay local. External integrations disabled.
- Organization is tenant boundary; location scope never implies organization scope.
- Use centralized canUse/canGrant/canManageUser, explicit delegation provenance, DENY precedence, immutable role versions.
- DB runtime is non-owner/no BYPASSRLS. Only transaction-local tenant context. Composite foreign keys prevent cross-tenant links.
- Internal Argon2id authentication, opaque hashed sessions, CSRF/Origin checks, MFA before privileged business access.
- Platform has separate identity/session and private entrypoint; never mounted in public API.
- Agents own disjoint files; coordinate contracts before edits. Never overwrite another agent's work.
- Done requires real PostgreSQL security tests, unit/typecheck/lint/build and browser flows. Report missing evidence honestly.
- Feature-Sliced Design: Next app routes compose src/views → widgets → features → entities → shared. API uses app → features → entities → shared. Cross-slice imports use public index APIs; no sibling/upward imports or runtime cycles.
- Own types in `*.types.ts` and reusable data constants in `config/*.constants.ts`. Keep all TSX files ≤150 physical lines and other TS/MJS/CSS modules, types/constants/tests ≤300. Extract cohesive responsibilities; never code-golf to meet limits. See docs/code-style.md.
- Run scripts/pnpm check:style and format:check alongside lint/typecheck/tests after structural edits.

Structure: apps/web (tenant UI), apps/platform-web (private UI), apps/api (separate public/private entrypoints); packages/db, authz, contracts, ui; scripts, infra and docs.
Local startup: scripts/pnpm db:local, then scripts/pnpm dev. Validation: scripts/pnpm db:validate, db:generate, test, test:db, test:integration, typecheck, lint, build, test:e2e. Browser tests require the local servers. Record results in docs/verification.md.
