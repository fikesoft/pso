BEGIN;
CREATE TABLE public."UpsellRule" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "sourceProductId" uuid NOT NULL,
 "targetProductId" uuid NOT NULL,
 name text NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 2 AND 100),
 "sortOrder" integer NOT NULL DEFAULT 0 CHECK ("sortOrder" BETWEEN 0 AND 100000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 "requestKey" uuid NOT NULL,
 "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "createdByUserId" uuid NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 "updatedAt" timestamptz(3) NOT NULL,
 CHECK ("sourceProductId"<>"targetProductId"),
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","locationId",id),
 UNIQUE ("organizationId","locationId",id,"targetProductId"),
 UNIQUE ("organizationId","locationId","requestKey"),
 FOREIGN KEY ("organizationId","locationId","sourceProductId")
  REFERENCES public."LocationProduct"("organizationId","locationId","productId") ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","locationId","targetProductId")
  REFERENCES public."LocationProduct"("organizationId","locationId","productId") ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","createdByUserId")
  REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX upsell_rule_active_pair ON public."UpsellRule"
 ("organizationId","locationId","sourceProductId","targetProductId") WHERE status='ACTIVE';
CREATE INDEX upsell_rule_location_status ON public."UpsellRule"("organizationId","locationId",status,"sourceProductId","sortOrder",id);
ALTER TABLE public."UpsellRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UpsellRule" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."UpsellRule" FROM PUBLIC,pos_auth,pos_runtime,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT,UPDATE ON public."UpsellRule" TO pos_runtime;
CREATE POLICY upsell_rule_tenant ON public."UpsellRule" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE FUNCTION public.protect_upsell_rule() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE mutable text[] := ARRAY['name','sortOrder','status','version','updatedAt'];
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."createdByUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid OR NEW.version<>1 THEN
   RAISE EXCEPTION 'upsell rule must originate from current actor with initial version' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN
  RAISE EXCEPTION 'upsell rule identity is immutable and version must advance' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER upsell_rule_identity BEFORE INSERT OR UPDATE ON public."UpsellRule"
 FOR EACH ROW EXECUTE FUNCTION public.protect_upsell_rule();
CREATE TRIGGER upsell_rule_no_delete BEFORE DELETE ON public."UpsellRule"
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
CREATE FUNCTION public.notify_upsell_rule_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_notify('pos_catalog_changed',json_build_object(
  'organizationId',NEW."organizationId",'locationId',NEW."locationId")::text);
 RETURN NEW;
END $$;
CREATE TRIGGER upsell_rule_changed AFTER INSERT OR UPDATE ON public."UpsellRule"
 FOR EACH ROW EXECUTE FUNCTION public.notify_upsell_rule_change();
REVOKE ALL ON FUNCTION public.protect_upsell_rule(),public.notify_upsell_rule_change() FROM PUBLIC;
COMMIT;
