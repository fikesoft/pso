-- DEV-091: action permissions remain centralized in the API; DB guards tenant and command integrity.
BEGIN;
CREATE TABLE "CashRegister" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 code text NOT NULL CHECK (code ~ '^[A-Z0-9_-]{1,32}$'),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120 AND name=btrim(name)),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "createdByUserId" uuid NOT NULL, "updatedByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "creationRequestKey" uuid NOT NULL, "lastRequestKey" uuid NOT NULL,
 "lastRequestHash" text NOT NULL CHECK ("lastRequestHash" ~ '^[0-9a-f]{64}$'),
 UNIQUE ("organizationId",id), UNIQUE ("organizationId","locationId",id),
 CONSTRAINT cash_register_code_unique UNIQUE ("organizationId","locationId",code),
 CONSTRAINT cash_register_creation_unique UNIQUE ("organizationId","locationId","creationRequestKey"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","updatedByUserId") REFERENCES "CompanyUser"("organizationId",id)
);
CREATE TABLE "CashRegisterCommand" (
 id uuid PRIMARY KEY, "organizationId" uuid NOT NULL, "locationId" uuid NOT NULL,
 "requestKey" uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('CREATE','RENAME','ARCHIVE')),
 "actorUserId" uuid NOT NULL, status text NOT NULL CHECK (status IN ('SUCCEEDED','RETIRED')),
 "registerId" uuid, "requestHash" text, "expectedVersion" integer,
 "resultCode" text, "resultName" text, "resultStatus" text, "resultVersion" integer,
 "resultCreatedAt" timestamptz(3), "resultUpdatedAt" timestamptz(3),
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT cash_register_command_identity UNIQUE ("organizationId","locationId","requestKey"),
 CONSTRAINT cash_register_command_result UNIQUE ("organizationId","registerId","resultVersion"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id),
 FOREIGN KEY ("organizationId","actorUserId") REFERENCES "CompanyUser"("organizationId",id),
 FOREIGN KEY ("organizationId","locationId","registerId") REFERENCES "CashRegister"("organizationId","locationId",id),
 CONSTRAINT cash_register_command_shape CHECK (
  (status='SUCCEEDED' AND "registerId" IS NOT NULL AND "requestHash" IS NOT NULL
   AND "requestHash" ~ '^[0-9a-f]{64}$' AND "resultCode" IS NOT NULL AND "resultName" IS NOT NULL
   AND "resultStatus" IS NOT NULL AND "resultVersion" IS NOT NULL
   AND "resultCreatedAt" IS NOT NULL AND "resultUpdatedAt" IS NOT NULL
   AND ((kind='CREATE' AND "expectedVersion" IS NULL AND "resultVersion"=1 AND "resultStatus"='ACTIVE')
    OR (kind IN ('RENAME','ARCHIVE') AND "expectedVersion" IS NOT NULL AND "expectedVersion">0
     AND "resultVersion"="expectedVersion"+1
     AND "resultStatus"=CASE kind WHEN 'RENAME' THEN 'ACTIVE' ELSE 'ARCHIVED' END)))
  OR (status='RETIRED' AND "requestHash" IS NULL AND "expectedVersion" IS NULL
   AND "resultCode" IS NULL AND "resultName" IS NULL AND "resultStatus" IS NULL AND "resultVersion" IS NULL
   AND "resultCreatedAt" IS NULL AND "resultUpdatedAt" IS NULL
   AND ((kind='CREATE' AND "registerId" IS NULL) OR (kind IN ('RENAME','ARCHIVE') AND "registerId" IS NOT NULL))))
);
ALTER TABLE "CashRegister" ADD CONSTRAINT cash_register_last_command_fk
 FOREIGN KEY ("organizationId","locationId","lastRequestKey")
 REFERENCES "CashRegisterCommand"("organizationId","locationId","requestKey") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "CashRegister" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashRegister" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CashRegisterCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashRegisterCommand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON "CashRegister" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY tenant_scope ON "CashRegisterCommand" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
REVOKE ALL ON "CashRegister","CashRegisterCommand" FROM PUBLIC,pos_runtime,pos_auth,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT ON "CashRegister","CashRegisterCommand" TO pos_runtime;
GRANT UPDATE (name,status,version,"updatedByUserId","updatedAt","lastRequestKey","lastRequestHash") ON "CashRegister" TO pos_runtime;
CREATE TRIGGER cash_register_command_immutable BEFORE UPDATE OR DELETE ON "CashRegisterCommand"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.cash_register_actor_allowed(org uuid,loc uuid,actor uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT org IS NOT DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid
  AND actor IS NOT DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
  AND EXISTS (SELECT 1 FROM public."Organization" o WHERE o.id=org AND o.status='ACTIVE')
  AND EXISTS (SELECT 1 FROM public."Location" l WHERE l."organizationId"=org AND l.id=loc AND l.status='ACTIVE')
  AND EXISTS (SELECT 1 FROM public."CompanyUser" u WHERE u."organizationId"=org AND u.id=actor AND u.status='ACTIVE'
   AND (u."isPrimaryAdmin" OR EXISTS (SELECT 1 FROM public."UserLocationAccess" a
    WHERE a."organizationId"=org AND a."locationId"=loc AND a."userId"=actor)))
$$;
REVOKE ALL ON FUNCTION public.cash_register_actor_allowed(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cash_register_actor_allowed(uuid,uuid,uuid) TO pos_runtime;

CREATE FUNCTION public.protect_cash_register() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'cash registers must be archived, never deleted' USING ERRCODE='23514';
 END IF;
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."updatedByUserId") THEN
  RAISE EXCEPTION 'cash register requires the current active scoped actor' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'ACTIVE' OR NEW.version<>1
   OR NEW."createdByUserId" IS DISTINCT FROM NEW."updatedByUserId"
   OR NEW."creationRequestKey" IS DISTINCT FROM NEW."lastRequestKey" THEN
   RAISE EXCEPTION 'cash register requires its initial creation identity' USING ERRCODE='23514';
  END IF;
  NEW."createdAt":=statement_timestamp();
 ELSE
  IF OLD.status<>'ACTIVE' OR NEW.version<>OLD.version+1
   OR NEW."lastRequestKey" IS NOT DISTINCT FROM OLD."lastRequestKey"
   OR (NEW.status='ARCHIVED' AND NEW.name IS DISTINCT FROM OLD.name)
   OR (to_jsonb(NEW)-ARRAY['name','status','version','updatedByUserId','updatedAt','lastRequestKey','lastRequestHash'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['name','status','version','updatedByUserId','updatedAt','lastRequestKey','lastRequestHash']) THEN
   RAISE EXCEPTION 'cash register requires a fresh versioned rename or terminal archive' USING ERRCODE='23514';
  END IF;
 END IF;
 -- No Shift exists in DEV-091. DEV-092 must add its OPEN/archive guard under this row lock.
 NEW."updatedAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER cash_register_history BEFORE INSERT OR UPDATE OR DELETE ON "CashRegister"
 FOR EACH ROW EXECUTE FUNCTION public.protect_cash_register();

CREATE FUNCTION public.validate_cash_register_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.cash_register_actor_allowed(NEW."organizationId",NEW."locationId",NEW."actorUserId") THEN
  RAISE EXCEPTION 'cash register command requires the current active scoped actor' USING ERRCODE='23514';
 END IF;
 -- Retirement and update use the same Register -> Command lock order.
 IF NEW.status='RETIRED' AND NEW.kind IN ('RENAME','ARCHIVE') THEN
  PERFORM id FROM public."CashRegister" WHERE "organizationId"=NEW."organizationId"
   AND "locationId"=NEW."locationId" AND id=NEW."registerId" FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'cash register retirement requires its scoped target' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.status='RETIRED' AND EXISTS (SELECT 1 FROM public."CashRegister" r
  WHERE r."organizationId"=NEW."organizationId" AND r."locationId"=NEW."locationId"
   AND (r."creationRequestKey"=NEW."requestKey" OR r."lastRequestKey"=NEW."requestKey")) THEN
  RAISE EXCEPTION 'cannot retire an applied register key' USING ERRCODE='23514';
 END IF;
 NEW."createdAt":=statement_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER cash_register_command_validation BEFORE INSERT ON "CashRegisterCommand"
 FOR EACH ROW EXECUTE FUNCTION public.validate_cash_register_command();

CREATE FUNCTION public.check_cash_register_effect() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r public."CashRegister"; c public."CashRegisterCommand"; expected_kind text;
BEGIN
 SELECT * INTO r FROM public."CashRegister" WHERE "organizationId"=NEW."organizationId" AND id=NEW.id;
 SELECT * INTO c FROM public."CashRegisterCommand" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND "requestKey"=NEW."lastRequestKey";
 expected_kind:=CASE WHEN TG_OP='INSERT' THEN 'CREATE' WHEN NEW.status='ARCHIVED' THEN 'ARCHIVE' ELSE 'RENAME' END;
 IF r.id IS NULL OR to_jsonb(r) IS DISTINCT FROM to_jsonb(NEW) OR c.id IS NULL
  OR c.status IS DISTINCT FROM 'SUCCEEDED' OR c.kind IS DISTINCT FROM expected_kind
  OR (c."registerId",c."actorUserId",c."requestHash",c."resultCode",c."resultName",c."resultStatus",c."resultVersion",c."resultCreatedAt",c."resultUpdatedAt")
   IS DISTINCT FROM (NEW.id,NEW."updatedByUserId",NEW."lastRequestHash",NEW.code,NEW.name,NEW.status,NEW.version,NEW."createdAt",NEW."updatedAt") THEN
  RAISE EXCEPTION 'cash register effect requires its exact current terminal command' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF c."expectedVersion" IS NOT NULL OR NEW."creationRequestKey" IS DISTINCT FROM c."requestKey" THEN
   RAISE EXCEPTION 'cash register creation command identity mismatch' USING ERRCODE='23514';
  END IF;
 ELSIF c."expectedVersion" IS DISTINCT FROM OLD.version THEN
  RAISE EXCEPTION 'cash register command expected version mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cash_register_effect_consistency AFTER INSERT OR UPDATE ON "CashRegister"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_cash_register_effect();

CREATE FUNCTION public.check_cash_register_command() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r public."CashRegister";
BEGIN
 IF NEW.status='RETIRED' THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public."CashRegister" WHERE "organizationId"=NEW."organizationId"
  AND "locationId"=NEW."locationId" AND id=NEW."registerId";
 IF r.id IS NULL
  OR (r."lastRequestKey",r."updatedByUserId",r."lastRequestHash",r.code,r.name,r.status,r.version,r."createdAt",r."updatedAt")
   IS DISTINCT FROM (NEW."requestKey",NEW."actorUserId",NEW."requestHash",NEW."resultCode",NEW."resultName",NEW."resultStatus",NEW."resultVersion",NEW."resultCreatedAt",NEW."resultUpdatedAt")
  OR (NEW.kind='CREATE' AND r."creationRequestKey" IS DISTINCT FROM NEW."requestKey") THEN
  RAISE EXCEPTION 'successful cash register command requires its exact effect' USING ERRCODE='23514';
 END IF;
 -- No xmin/txid comparison: a previously committed row already has its UNIQUE immutable command.
 -- Another key cannot match lastRequestKey; a duplicate key cannot be inserted.
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER cash_register_command_consistency AFTER INSERT ON "CashRegisterCommand"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_cash_register_command();
REVOKE ALL ON FUNCTION public.protect_cash_register(),public.validate_cash_register_command(),
 public.check_cash_register_effect(),public.check_cash_register_command() FROM PUBLIC;
INSERT INTO public."Permission"(key,label,"scopeTypes",delegable) VALUES
 ('cash.registers.read','Vizualizarea caselor',ARRAY['LOCATION'],true),
 ('cash.registers.manage','Administrarea caselor',ARRAY['LOCATION'],true);
COMMIT;
