BEGIN;
CREATE TABLE public."MenuSchedule" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
 "eventName" text CHECK ("eventName" IS NULL OR length(btrim("eventName")) BETWEEN 2 AND 100),
 weekdays integer[] NOT NULL,
 CHECK (cardinality(weekdays) BETWEEN 1 AND 7 AND array_position(weekdays,NULL) IS NULL
  AND weekdays <@ ARRAY[0,1,2,3,4,5,6]
  AND cardinality(weekdays)=(CASE WHEN 0=ANY(weekdays) THEN 1 ELSE 0 END)
   +(CASE WHEN 1=ANY(weekdays) THEN 1 ELSE 0 END)+(CASE WHEN 2=ANY(weekdays) THEN 1 ELSE 0 END)
   +(CASE WHEN 3=ANY(weekdays) THEN 1 ELSE 0 END)+(CASE WHEN 4=ANY(weekdays) THEN 1 ELSE 0 END)
   +(CASE WHEN 5=ANY(weekdays) THEN 1 ELSE 0 END)+(CASE WHEN 6=ANY(weekdays) THEN 1 ELSE 0 END)),
 "startMinute" integer NOT NULL CHECK ("startMinute" BETWEEN 0 AND 1439),
 "endMinute" integer NOT NULL CHECK ("endMinute" BETWEEN 0 AND 1440),
 CHECK ("startMinute"<>"endMinute"),
 "startsOn" date CHECK ("startsOn" IS NULL OR "startsOn" BETWEEN DATE '0001-01-01' AND DATE '9998-12-31'),
 "endsOn" date CHECK ("endsOn" IS NULL OR "endsOn" BETWEEN DATE '0001-01-01' AND DATE '9998-12-31'),
 CHECK ("startsOn" IS NULL OR "endsOn" IS NULL OR "startsOn"<="endsOn"),
 CHECK ("eventName" IS NULL OR ("startsOn" IS NOT NULL AND "endsOn" IS NOT NULL)),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "requestKey" uuid NOT NULL,
 "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "createdByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 "updatedAt" timestamptz(3) NOT NULL,
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","locationId",id),
 UNIQUE ("organizationId","locationId","requestKey"),
 FOREIGN KEY ("organizationId","locationId") REFERENCES public."Location"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX menu_schedule_location_status ON public."MenuSchedule"("organizationId","locationId",status,id);
CREATE TABLE public."MenuScheduleProduct" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "menuScheduleId" uuid NOT NULL,
 "productId" uuid NOT NULL,
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","menuScheduleId","productId"),
 FOREIGN KEY ("organizationId","locationId","menuScheduleId")
  REFERENCES public."MenuSchedule"("organizationId","locationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","locationId","productId")
  REFERENCES public."LocationProduct"("organizationId","locationId","productId") ON DELETE RESTRICT
);
CREATE INDEX menu_schedule_product_location ON public."MenuScheduleProduct"("organizationId","locationId","productId");

DO $security$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['MenuSchedule','MenuScheduleProduct'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,pos_auth,pos_runtime,pos_platform,pos_worker,pos_internal',tab);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO pos_runtime',tab);
  EXECUTE format('CREATE POLICY menu_schedule_tenant ON public.%I TO pos_runtime
    USING ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)
    WITH CHECK ("organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',tab);
 END LOOP;
END $security$;
GRANT UPDATE ON public."MenuSchedule" TO pos_runtime;
GRANT DELETE ON public."MenuScheduleProduct" TO pos_runtime;

CREATE FUNCTION public.protect_menu_schedule() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE mutable text[] := ARRAY['name','eventName','weekdays','startMinute','endMinute','startsOn','endsOn','status','version','updatedAt'];
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."createdByUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN
   RAISE EXCEPTION 'menu schedule creator must match tenant actor' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN
  RAISE EXCEPTION 'menu schedule identity is immutable and version must advance' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_schedule_identity BEFORE INSERT OR UPDATE ON public."MenuSchedule"
 FOR EACH ROW EXECUTE FUNCTION public.protect_menu_schedule();
CREATE TRIGGER menu_schedule_no_delete BEFORE DELETE ON public."MenuSchedule"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.touch_menu_schedule_products() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE org uuid; parent_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN org := OLD."organizationId"; parent_id := OLD."menuScheduleId";
 ELSE org := NEW."organizationId"; parent_id := NEW."menuScheduleId"; END IF;
 -- A real parent write serializes competing membership changes even at REPEATABLE READ.
 UPDATE public."MenuSchedule" SET version=version+1,"updatedAt"=clock_timestamp()
  WHERE "organizationId"=org AND id=parent_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'menu schedule outside tenant context' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_schedule_product_parent BEFORE INSERT OR DELETE ON public."MenuScheduleProduct"
 FOR EACH ROW EXECUTE FUNCTION public.touch_menu_schedule_products();
CREATE TRIGGER menu_schedule_product_no_update BEFORE UPDATE ON public."MenuScheduleProduct"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.check_menu_schedule_products() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE size integer;
BEGIN
 SELECT count(*) INTO size FROM public."MenuScheduleProduct"
  WHERE "organizationId"=NEW."organizationId" AND "menuScheduleId"=NEW.id;
 IF size NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'menu schedule requires one to one hundred local products' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER menu_schedule_products_complete AFTER INSERT OR UPDATE ON public."MenuSchedule"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_menu_schedule_products();
REVOKE ALL ON FUNCTION public.protect_menu_schedule(),public.touch_menu_schedule_products(),public.check_menu_schedule_products() FROM PUBLIC;
COMMIT;
