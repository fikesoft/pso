-- Execute once per cluster as a local administrator BEFORE migrations.
-- Credentials are provisioned separately; this file never embeds passwords.
-- No role receives SUPERUSER, BYPASSRLS, CREATEROLE or CREATEDB.
DO $roles$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['pos_migrator','pos_runtime','pos_auth','pos_platform','pos_worker'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',role_name);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pos_internal') THEN
    CREATE ROLE pos_internal NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $roles$;
GRANT pos_internal TO pos_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO pos_migrator;
-- The database must be owned by pos_migrator (set when CREATE DATABASE runs).
