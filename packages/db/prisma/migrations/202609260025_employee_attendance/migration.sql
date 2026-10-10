BEGIN;

ALTER TABLE public."CompanyUser"
 ADD COLUMN "firstName" text,
 ADD COLUMN "lastName" text,
 ADD COLUMN phone text,
 ADD COLUMN email text,
 ADD COLUMN "employeeCode" text,
 ADD COLUMN "hireDate" date,
 ADD CONSTRAINT employee_first_name CHECK ("firstName" IS NULL OR
   ("firstName"=btrim("firstName") AND length("firstName") BETWEEN 1 AND 100)),
 ADD CONSTRAINT employee_last_name CHECK ("lastName" IS NULL OR
   ("lastName"=btrim("lastName") AND length("lastName") BETWEEN 1 AND 100)),
 ADD CONSTRAINT employee_phone CHECK (phone IS NULL OR length(phone) BETWEEN 3 AND 40),
 ADD CONSTRAINT employee_email CHECK (email IS NULL OR length(email) BETWEEN 3 AND 254),
 ADD CONSTRAINT employee_code CHECK ("employeeCode" IS NULL OR
   ("employeeCode"=btrim("employeeCode") AND length("employeeCode") BETWEEN 1 AND 40)),
 ADD CONSTRAINT employee_hire_date CHECK ("hireDate" IS NULL OR isfinite("hireDate"));
CREATE UNIQUE INDEX employee_code_unique ON public."CompanyUser"("organizationId","employeeCode")
 WHERE "employeeCode" IS NOT NULL;

CREATE TABLE public."WorkShift" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "userId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "startedAt" timestamptz(3) NOT NULL DEFAULT now(),
 "endedAt" timestamptz(3),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_BREAK','ENDED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "startRequestKey" uuid NOT NULL,
 "roleSnapshot" jsonb NOT NULL CHECK (jsonb_typeof("roleSnapshot")='object'),
 CHECK (isfinite("startedAt") AND ("endedAt" IS NULL OR
   (isfinite("endedAt") AND "endedAt">="startedAt"))),
 CHECK ((status='ENDED')=("endedAt" IS NOT NULL)),
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","locationId",id,"userId"),
 UNIQUE ("organizationId","userId","startRequestKey"),
 FOREIGN KEY ("organizationId","userId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","locationId") REFERENCES public."Location"("organizationId",id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX work_shift_one_active ON public."WorkShift"("organizationId","userId") WHERE status<>'ENDED';
CREATE INDEX "WorkShift_organizationId_locationId_startedAt_idx" ON public."WorkShift"("organizationId","locationId","startedAt");
CREATE INDEX "WorkShift_organizationId_userId_startedAt_idx" ON public."WorkShift"("organizationId","userId","startedAt");

CREATE TABLE public."WorkBreak" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "shiftId" uuid NOT NULL,
 "userId" uuid NOT NULL,
 "startedAt" timestamptz(3) NOT NULL DEFAULT now(),
 "endedAt" timestamptz(3),
 CHECK (isfinite("startedAt") AND ("endedAt" IS NULL OR
   (isfinite("endedAt") AND "endedAt">="startedAt"))),
 UNIQUE ("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","shiftId","userId")
  REFERENCES public."WorkShift"("organizationId","locationId",id,"userId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX work_break_one_active ON public."WorkBreak"("organizationId","shiftId") WHERE "endedAt" IS NULL;
CREATE INDEX "WorkBreak_organizationId_shiftId_startedAt_idx" ON public."WorkBreak"("organizationId","shiftId","startedAt");

CREATE TABLE public."AttendanceEvent" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "shiftId" uuid NOT NULL,
 "userId" uuid NOT NULL,
 "actorUserId" uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('START_SHIFT','START_BREAK','END_BREAK','END_SHIFT')),
 "requestKey" uuid NOT NULL,
 "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "createdAt" timestamptz(3) NOT NULL DEFAULT now() CHECK (isfinite("createdAt")),
 "shiftVersion" integer NOT NULL DEFAULT 1 CHECK ("shiftVersion">0),
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","userId","requestKey"),
 UNIQUE ("organizationId","shiftId","shiftVersion"),
 FOREIGN KEY ("organizationId","locationId","shiftId","userId")
  REFERENCES public."WorkShift"("organizationId","locationId",id,"userId") ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX "AttendanceEvent_organizationId_locationId_createdAt_idx" ON public."AttendanceEvent"("organizationId","locationId","createdAt");

DO $attendance_security$
DECLARE table_name text; tenant text := '"organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid';
BEGIN
 FOREACH table_name IN ARRAY ARRAY['WorkShift','WorkBreak','AttendanceEvent'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY attendance_read ON public.%I FOR SELECT TO pos_runtime USING (%s)',table_name,tenant);
  EXECUTE format('CREATE POLICY attendance_internal ON public.%I TO pos_internal USING (%s) WITH CHECK (%s)',table_name,tenant,tenant);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal',table_name);
  EXECUTE format('GRANT SELECT ON public.%I TO pos_runtime,pos_internal',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['Location','UserLocationAccess','UserRoleAssignment','RoleVersion','Role'] LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO pos_internal',table_name);
  EXECUTE format('CREATE POLICY attendance_snapshot_read ON public.%I FOR SELECT TO pos_internal USING (%s)',table_name,tenant);
 END LOOP;
END $attendance_security$;
GRANT INSERT,UPDATE ON public."WorkShift",public."WorkBreak" TO pos_internal;
GRANT INSERT ON public."AttendanceEvent" TO pos_runtime;
CREATE POLICY attendance_self_event ON public."AttendanceEvent" FOR INSERT TO pos_runtime
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid
 AND "userId"=nullif(current_setting('app.user_id',true),'')::uuid AND "actorUserId"="userId");

-- Even the internal identity can mutate these rows only inside the event trigger.
CREATE FUNCTION public.protect_attendance_state() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' OR current_user<>'pos_internal' OR pg_trigger_depth()<>2 THEN
  RAISE EXCEPTION 'attendance state changes require an immutable action event' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='WorkShift' THEN
   IF OLD.status='ENDED' OR NEW.version<>OLD.version+1 OR
    (to_jsonb(NEW)-ARRAY['status','version','endedAt']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','version','endedAt']) THEN
    RAISE EXCEPTION 'shift identity, start time and role snapshot are immutable' USING ERRCODE='23514';
   END IF;
  ELSIF OLD."endedAt" IS NOT NULL OR NEW."endedAt" IS NULL OR
   (to_jsonb(NEW)-'endedAt') IS DISTINCT FROM (to_jsonb(OLD)-'endedAt') THEN
   RAISE EXCEPTION 'a break closes only once and its start remains immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_shift_history BEFORE INSERT OR UPDATE OR DELETE ON public."WorkShift"
 FOR EACH ROW EXECUTE FUNCTION public.protect_attendance_state();
CREATE TRIGGER work_break_history BEFORE INSERT OR UPDATE OR DELETE ON public."WorkBreak"
 FOR EACH ROW EXECUTE FUNCTION public.protect_attendance_state();
CREATE TRIGGER attendance_event_immutable BEFORE UPDATE OR DELETE ON public."AttendanceEvent"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

-- BEFORE-trigger side effects must not survive INSERT ... ON CONFLICT DO NOTHING.
-- Each individual version needs its own event, including multiple actions in one transaction.
CREATE FUNCTION public.check_attendance_event_written() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_action text;
BEGIN
 expected_action := CASE WHEN TG_OP='INSERT' THEN 'START_SHIFT'
  WHEN NEW.status='ENDED' THEN 'END_SHIFT'
  WHEN NEW.status='ON_BREAK' THEN 'START_BREAK' ELSE 'END_BREAK' END;
 IF NOT EXISTS (SELECT 1 FROM public."AttendanceEvent" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "shiftId"=NEW.id AND "userId"=NEW."userId"
  AND "shiftVersion"=NEW.version AND action=expected_action) THEN
  RAISE EXCEPTION 'each attendance transition requires its immutable action event' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER work_shift_event_complete AFTER INSERT OR UPDATE ON public."WorkShift"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_attendance_event_written();

CREATE FUNCTION public.apply_attendance_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor public."CompanyUser"; shift_row public."WorkShift"; snapshot jsonb; event_time timestamptz(3);
BEGIN
 IF NEW."organizationId" IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
  OR NEW."actorUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
  OR NEW."userId" IS DISTINCT FROM NEW."actorUserId" THEN
  RAISE EXCEPTION 'attendance actions require their authenticated tenant employee' USING ERRCODE='23514';
 END IF;
 -- User row serializes starts across locations and all transitions for that employee.
 SELECT * INTO actor FROM public."CompanyUser" WHERE id=NEW."userId"
  AND "organizationId"=NEW."organizationId" FOR UPDATE;
 IF actor.status IS DISTINCT FROM 'ACTIVE' OR NOT EXISTS (
  SELECT 1 FROM public."Organization" WHERE id=NEW."organizationId" AND status='ACTIVE'
 ) OR NOT EXISTS (SELECT 1 FROM public."Location" WHERE id=NEW."locationId"
  AND "organizationId"=NEW."organizationId" AND status='ACTIVE') OR
  (NOT actor."isPrimaryAdmin" AND NOT EXISTS (SELECT 1 FROM public."UserLocationAccess"
   WHERE "organizationId"=NEW."organizationId" AND "userId"=NEW."userId" AND "locationId"=NEW."locationId")) THEN
  RAISE EXCEPTION 'attendance requires active employee and assigned active location' USING ERRCODE='23514';
 END IF;
 event_time := clock_timestamp()::timestamptz(3);
 IF NEW.action='START_SHIFT' THEN
  IF NEW."shiftVersion"<>1 OR EXISTS (SELECT 1 FROM public."WorkShift"
   WHERE "organizationId"=NEW."organizationId" AND "userId"=NEW."userId" AND status<>'ENDED') THEN
   RAISE EXCEPTION 'employee already has an active shift or start version is invalid' USING ERRCODE='23514';
  END IF;
  SELECT jsonb_build_object('isPrimaryAdmin',actor."isPrimaryAdmin",'assignments',coalesce(jsonb_agg(
   jsonb_build_object('assignmentId',a.id,'roleId',r.id,'roleVersionId',v.id,'roleName',r.name,
    'roleVersion',v.version,'scopeType',a."scopeType",'locationId',a."locationId") ORDER BY a.id),'[]'::jsonb))
   INTO snapshot FROM public."UserRoleAssignment" a
   JOIN public."RoleVersion" v ON v.id=a."roleVersionId" AND v."organizationId"=a."organizationId"
   JOIN public."Role" r ON r.id=v."roleId" AND r."organizationId"=v."organizationId"
   WHERE a."organizationId"=NEW."organizationId" AND a."userId"=NEW."userId"
    AND a."revokedAt" IS NULL AND r.status='ACTIVE'
    AND (a."scopeType"='ORGANIZATION' OR (a."scopeType"='LOCATION' AND a."locationId"=NEW."locationId"));
  INSERT INTO public."WorkShift" (id,"organizationId","userId","locationId","startedAt","startRequestKey","roleSnapshot")
   VALUES (NEW."shiftId",NEW."organizationId",NEW."userId",NEW."locationId",event_time,NEW."requestKey",snapshot);
 ELSE
  SELECT * INTO shift_row FROM public."WorkShift" WHERE id=NEW."shiftId"
   AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId"
   AND "userId"=NEW."userId" FOR UPDATE;
  IF shift_row.id IS NULL OR shift_row.status='ENDED' THEN
   RAISE EXCEPTION 'attendance action requires the employee active shift' USING ERRCODE='23514';
  END IF;
  IF NEW."shiftVersion"<>shift_row.version+1 THEN
   RAISE EXCEPTION 'attendance shift version is stale' USING ERRCODE='40001';
  END IF;
  SELECT greatest(event_time,shift_row."startedAt",max("createdAt")) INTO event_time
   FROM public."AttendanceEvent" WHERE "organizationId"=NEW."organizationId" AND "shiftId"=NEW."shiftId";
  IF NEW.action='START_BREAK' AND shift_row.status='ACTIVE' THEN
   INSERT INTO public."WorkBreak" (id,"organizationId","locationId","shiftId","userId","startedAt")
    VALUES (gen_random_uuid(),NEW."organizationId",NEW."locationId",NEW."shiftId",NEW."userId",event_time);
   UPDATE public."WorkShift" SET status='ON_BREAK',version=NEW."shiftVersion" WHERE id=NEW."shiftId";
  ELSIF NEW.action='END_BREAK' AND shift_row.status='ON_BREAK' THEN
   UPDATE public."WorkBreak" SET "endedAt"=event_time
    WHERE "organizationId"=NEW."organizationId" AND "shiftId"=NEW."shiftId" AND "endedAt" IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'active break missing' USING ERRCODE='23514'; END IF;
   UPDATE public."WorkShift" SET status='ACTIVE',version=NEW."shiftVersion" WHERE id=NEW."shiftId";
  ELSIF NEW.action='END_SHIFT' THEN
   UPDATE public."WorkBreak" SET "endedAt"=event_time
    WHERE "organizationId"=NEW."organizationId" AND "shiftId"=NEW."shiftId" AND "endedAt" IS NULL;
   UPDATE public."WorkShift" SET status='ENDED',"endedAt"=event_time,version=NEW."shiftVersion" WHERE id=NEW."shiftId";
  ELSE
   RAISE EXCEPTION 'invalid attendance transition' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW."createdAt" := event_time;
 RETURN NEW;
END $$;
GRANT CREATE ON SCHEMA public TO pos_internal;
ALTER FUNCTION public.apply_attendance_event() OWNER TO pos_internal;
REVOKE CREATE ON SCHEMA public FROM pos_internal;
REVOKE ALL ON FUNCTION public.apply_attendance_event(),public.protect_attendance_state(),public.check_attendance_event_written()
 FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker;
CREATE TRIGGER attendance_apply BEFORE INSERT ON public."AttendanceEvent"
 FOR EACH ROW EXECUTE FUNCTION public.apply_attendance_event();

INSERT INTO public."Permission" (key,label,"scopeTypes",delegable) VALUES
 ('attendance.clock','Pontarea turei proprii',ARRAY['LOCATION'],true),
 ('attendance.read','Vizualizarea pontajului personalului',ARRAY['LOCATION'],true);
COMMIT;
