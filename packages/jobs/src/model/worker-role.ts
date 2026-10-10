import type { PrismaClient } from '@pos/db';
import { JOB_OPTIONS } from '../config/jobs.constants';
import type { WorkerRole } from './jobs.types';

export async function assertWorkerDatabaseRole(client: PrismaClient) {
  const rows = await client.$queryRaw<WorkerRole[]>`
    SELECT r.rolname AS role,(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole) AS elevated,
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relowner=r.oid AND n.nspname IN ('public','pos_jobs')) AS owns,
      (has_schema_privilege(current_user,'public','CREATE') OR
        has_schema_privilege(current_user,'pos_jobs','CREATE')) AS "canCreate",
      pg_has_role(current_user,'pos_runtime','MEMBER') AS "runtimeMember",
      pg_has_role(current_user,'pos_internal','MEMBER') AS "internalMember"
    FROM pg_roles r WHERE r.rolname=current_user`;
  const role = rows[0];
  if (
    rows.length !== 1 ||
    !role ||
    role.role !== JOB_OPTIONS.workerRole ||
    role.elevated ||
    role.owns ||
    role.canCreate ||
    role.runtimeMember ||
    role.internalMember
  ) {
    throw new Error(
      'Workerul necesită pos_worker separat, fără privilegii de proprietar sau bypass.',
    );
  }
}
