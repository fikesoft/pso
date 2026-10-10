-- The original foundation transferred ownership before changing ACLs while the
-- migrator is NOINHERIT. Harden only the four affected identity/control helpers.
BEGIN;
DO $$
DECLARE function_oid oid;
BEGIN
  FOREACH function_oid IN ARRAY ARRAY[
    'pos_auth.lookup_tenant_login(text,text)'::regprocedure::oid,
    'pos_auth.lookup_tenant_session(text)'::regprocedure::oid,
    'pos_control.list_organizations()'::regprocedure::oid,
    'pos_control.provision_organization(text,text,text,text,text,text,timestamptz,uuid)'::regprocedure::oid
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid=function_oid AND p.prosecdef AND r.rolname='pos_internal'
        AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls) THEN
      RAISE EXCEPTION 'unexpected identity helper owner or signature';
    END IF;
  END LOOP;
END $$;
SET LOCAL ROLE pos_internal;
REVOKE ALL ON FUNCTION pos_auth.lookup_tenant_login(text,text),pos_auth.lookup_tenant_session(text),
  pos_control.list_organizations(),
  pos_control.provision_organization(text,text,text,text,text,text,timestamptz,uuid)
  FROM PUBLIC,pos_runtime,pos_worker,pos_auth,pos_platform;
GRANT EXECUTE ON FUNCTION pos_auth.lookup_tenant_login(text,text),pos_auth.lookup_tenant_session(text) TO pos_auth;
GRANT EXECUTE ON FUNCTION pos_control.list_organizations(),
  pos_control.provision_organization(text,text,text,text,text,text,timestamptz,uuid) TO pos_platform;
RESET ROLE;
DO $$
DECLARE function_oid oid;
BEGIN
  FOREACH function_oid IN ARRAY ARRAY[
    'pos_auth.lookup_tenant_login(text,text)'::regprocedure::oid,
    'pos_auth.lookup_tenant_session(text)'::regprocedure::oid,
    'pos_control.list_organizations()'::regprocedure::oid,
    'pos_control.provision_organization(text,text,text,text,text,text,timestamptz,uuid)'::regprocedure::oid
  ] LOOP
    IF has_function_privilege('pos_runtime',function_oid,'EXECUTE')
      OR has_function_privilege('pos_worker',function_oid,'EXECUTE')
      OR EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a
        WHERE p.oid=function_oid AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'identity helper ACL invariant failed';
    END IF;
  END LOOP;
END $$;
COMMIT;
