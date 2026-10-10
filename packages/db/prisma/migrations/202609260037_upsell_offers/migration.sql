BEGIN;
CREATE TABLE public."UpsellOffer" (
 id uuid PRIMARY KEY,
 "organizationId" uuid NOT NULL,
 "locationId" uuid NOT NULL,
 "ruleId" uuid NOT NULL,
 "ruleVersion" integer NOT NULL CHECK ("ruleVersion">0),
 "ruleName" text NOT NULL,
 "sourceProductId" uuid NOT NULL,
 "targetProductId" uuid NOT NULL,
 "createdByUserId" uuid NOT NULL,
 "requestKey" uuid NOT NULL,
 "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "shownAt" timestamptz(3) NOT NULL DEFAULT now(),
 "acceptedAt" timestamptz(3),
 "claimedOrderId" uuid,
 "claimedItemId" uuid,
 CHECK (("claimedOrderId" IS NULL)=("claimedItemId" IS NULL)),
 CHECK ("claimedOrderId" IS NULL OR "acceptedAt" IS NOT NULL),
 UNIQUE ("organizationId",id),
 UNIQUE ("organizationId","locationId",id,"targetProductId"),
 UNIQUE ("organizationId","locationId","createdByUserId","requestKey"),
 FOREIGN KEY ("organizationId","locationId","ruleId","targetProductId")
  REFERENCES public."UpsellRule"("organizationId","locationId",id,"targetProductId") ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","createdByUserId") REFERENCES public."CompanyUser"("organizationId",id) ON DELETE RESTRICT,
 FOREIGN KEY ("organizationId","locationId","claimedOrderId") REFERENCES public."Order"("organizationId","locationId",id) ON DELETE RESTRICT
);
CREATE INDEX upsell_offer_metrics ON public."UpsellOffer"("organizationId","locationId","ruleId","shownAt");
ALTER TABLE public."UpsellOffer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UpsellOffer" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."UpsellOffer" FROM PUBLIC,pos_auth,pos_runtime,pos_platform,pos_worker,pos_internal;
GRANT SELECT,INSERT,UPDATE ON public."UpsellOffer" TO pos_runtime;
CREATE POLICY upsell_offer_tenant ON public."UpsellOffer" TO pos_runtime
 USING ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK ("organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE FUNCTION public.protect_upsell_offer() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE rule public."UpsellRule"; mutable text[]:=ARRAY['acceptedAt','claimedOrderId','claimedItemId'];
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."createdByUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
    OR NEW."acceptedAt" IS NOT NULL OR NEW."claimedOrderId" IS NOT NULL OR NEW."claimedItemId" IS NOT NULL THEN
   RAISE EXCEPTION 'upsell offer must originate from current actor without acceptance or claim' USING ERRCODE='23514';
  END IF;
  SELECT * INTO rule FROM public."UpsellRule" WHERE id=NEW."ruleId" AND "organizationId"=NEW."organizationId" AND "locationId"=NEW."locationId" FOR SHARE;
  IF NOT FOUND OR rule.status<>'ACTIVE' OR rule.version<>NEW."ruleVersion" OR rule.name<>NEW."ruleName"
    OR rule."sourceProductId"<>NEW."sourceProductId" OR rule."targetProductId"<>NEW."targetProductId" THEN
   RAISE EXCEPTION 'upsell offer requires current rule snapshot' USING ERRCODE='23514';
  END IF;
  NEW."shownAt":=clock_timestamp();
 ELSE
  IF (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN
   RAISE EXCEPTION 'upsell offer snapshot is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" THEN
   IF OLD."acceptedAt" IS NOT NULL OR NEW."acceptedAt" IS NULL OR NEW."createdByUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN
    RAISE EXCEPTION 'upsell acceptance is one-way and requires original actor' USING ERRCODE='23514';
   END IF;
   NEW."acceptedAt":=clock_timestamp();
  END IF;
  IF NEW."claimedOrderId" IS DISTINCT FROM OLD."claimedOrderId" OR NEW."claimedItemId" IS DISTINCT FROM OLD."claimedItemId" THEN
   IF pg_trigger_depth()<2 OR OLD."claimedOrderId" IS NOT NULL OR NEW."claimedOrderId" IS NULL OR NEW."claimedItemId" IS NULL THEN
    RAISE EXCEPTION 'upsell claim is immutable and originates from an order line' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER upsell_offer_identity BEFORE INSERT OR UPDATE ON public."UpsellOffer" FOR EACH ROW EXECUTE FUNCTION public.protect_upsell_offer();
CREATE TRIGGER upsell_offer_no_delete BEFORE DELETE ON public."UpsellOffer" FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();
ALTER TABLE public."OrderItem" ADD COLUMN "sourceUpsellOfferId" uuid;
ALTER TABLE public."OrderItem" ADD CONSTRAINT order_item_upsell_offer_fk
 FOREIGN KEY ("organizationId","locationId","sourceUpsellOfferId","productId")
 REFERENCES public."UpsellOffer"("organizationId","locationId",id,"targetProductId") ON DELETE RESTRICT;
CREATE UNIQUE INDEX order_item_upsell_offer_unique ON public."OrderItem"("organizationId","sourceUpsellOfferId");
CREATE FUNCTION public.claim_order_upsell_offer() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE offer public."UpsellOffer";
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW."sourceUpsellOfferId" IS DISTINCT FROM OLD."sourceUpsellOfferId" THEN
   RAISE EXCEPTION 'order line upsell attribution is immutable' USING ERRCODE='23514';
  END IF;
 ELSIF NEW."sourceUpsellOfferId" IS NOT NULL THEN
  SELECT * INTO offer FROM public."UpsellOffer" WHERE id=NEW."sourceUpsellOfferId" AND "organizationId"=NEW."organizationId" FOR UPDATE;
  IF NOT FOUND OR offer."locationId"<>NEW."locationId" OR offer."targetProductId"<>NEW."productId"
    OR offer."acceptedAt" IS NULL OR offer."claimedOrderId" IS NOT NULL
    OR offer."createdByUserId" IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
    OR NEW."sourceWebsiteOrderItemId" IS NOT NULL THEN
   RAISE EXCEPTION 'upsell offer cannot be claimed by this order line' USING ERRCODE='23514';
  END IF;
  UPDATE public."UpsellOffer" SET "claimedOrderId"=NEW."orderId","claimedItemId"=NEW.id WHERE id=offer.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_item_upsell_claim BEFORE INSERT OR UPDATE ON public."OrderItem" FOR EACH ROW EXECUTE FUNCTION public.claim_order_upsell_offer();
REVOKE ALL ON FUNCTION public.protect_upsell_offer(),public.claim_order_upsell_offer() FROM PUBLIC;
COMMIT;
