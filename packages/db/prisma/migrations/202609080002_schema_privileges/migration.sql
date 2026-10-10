-- PostgreSQL <=14 templates can grant CREATE on public to PUBLIC in each new DB.
-- roles.sql runs against the bootstrap database; harden every actual app database.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM pos_runtime, pos_auth, pos_platform, pos_worker;
GRANT USAGE, CREATE ON SCHEMA public TO pos_migrator;
