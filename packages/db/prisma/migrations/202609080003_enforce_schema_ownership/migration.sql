-- On PostgreSQL14 database ownership does not automatically own public schema.
-- Bootstrap must execute ALTER SCHEMA public OWNER TO pos_migrator as cluster admin.
-- Do not silently accept REVOKE warnings by a role which is not the schema owner.
DO $ownership$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
    WHERE n.nspname='public' AND (r.rolname=current_user OR (r.rolname='pg_database_owner' AND pg_has_role(current_user,r.oid,'MEMBER')))
  ) THEN
    RAISE EXCEPTION 'Bootstrap prerequisite: schema public must be owned by pos_migrator or its pg_database_owner role';
  END IF;
END $ownership$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM pos_runtime, pos_auth, pos_platform, pos_worker;
DO $verify$
BEGIN
 IF has_schema_privilege('pos_runtime','public','CREATE') OR has_schema_privilege('pos_auth','public','CREATE')
    OR has_schema_privilege('pos_platform','public','CREATE') OR has_schema_privilege('pos_worker','public','CREATE') THEN
   RAISE EXCEPTION 'Application roles must not create objects in schema public';
 END IF;
END $verify$;
