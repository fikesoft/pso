-- Inbound website credentials and immutable inbox snapshots. No external calls or backfill.
BEGIN;

CREATE TABLE "WebsiteConnection" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId",id),
  FOREIGN KEY ("organizationId","locationId") REFERENCES "Location"("organizationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE TABLE "WebsiteApiKey" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "connectionId" uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  "secretHash" text NOT NULL CHECK ("secretHash" ~ '^[a-f0-9]{64}$'),
  "expiresAt" timestamptz(3) NOT NULL,
  "revokedAt" timestamptz(3),
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("expiresAt">"createdAt"),
  CHECK ("revokedAt" IS NULL OR "revokedAt">="createdAt"),
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId","connectionId",id),
  FOREIGN KEY ("organizationId","locationId","connectionId") REFERENCES "WebsiteConnection"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","createdByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE INDEX "WebsiteApiKey_organizationId_connectionId_createdAt_idx"
  ON "WebsiteApiKey"("organizationId","connectionId","createdAt");
CREATE TABLE "WebsiteOrder" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "connectionId" uuid NOT NULL,
  "createdWithKeyId" uuid NOT NULL,
  "externalOrderId" text NOT NULL CHECK (length(btrim("externalOrderId")) BETWEEN 1 AND 120),
  "requestKey" uuid NOT NULL,
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  "serviceType" text NOT NULL DEFAULT 'DELIVERY' CHECK ("serviceType"='DELIVERY'),
  currency text NOT NULL DEFAULT 'MDL' CHECK (currency='MDL'),
  total numeric(18,2) NOT NULL CHECK (total>=0 AND total<'Infinity'::numeric),
  "customerDataEncrypted" text NOT NULL CHECK (length("customerDataEncrypted") BETWEEN 16 AND 32768),
  "orderId" uuid,
  "decisionByUserId" uuid,
  "decidedAt" timestamptz(3),
  "rejectionReason" text,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  CHECK ("decidedAt" IS NULL OR "decidedAt">="createdAt"),
  CONSTRAINT website_order_decision CHECK (
    (status='PENDING' AND "orderId" IS NULL AND "decisionByUserId" IS NULL AND "decidedAt" IS NULL AND "rejectionReason" IS NULL)
    OR (status='ACCEPTED' AND "orderId" IS NOT NULL AND "decisionByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL AND "rejectionReason" IS NULL)
    OR (status='REJECTED' AND "orderId" IS NULL AND "decisionByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL
      AND "rejectionReason" IS NOT NULL AND length(btrim("rejectionReason")) BETWEEN 3 AND 1000)
  ),
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","locationId",id),
  UNIQUE ("organizationId","connectionId","externalOrderId"),
  UNIQUE ("organizationId","connectionId","requestKey"),
  FOREIGN KEY ("organizationId","locationId","connectionId") REFERENCES "WebsiteConnection"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","locationId","connectionId","createdWithKeyId") REFERENCES "WebsiteApiKey"("organizationId","locationId","connectionId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","locationId","orderId") REFERENCES "Order"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","decisionByUserId") REFERENCES "CompanyUser"("organizationId",id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX website_order_pos_order ON "WebsiteOrder"("organizationId","orderId") WHERE "orderId" IS NOT NULL;
CREATE INDEX "WebsiteOrder_organizationId_locationId_status_createdAt_idx"
  ON "WebsiteOrder"("organizationId","locationId",status,"createdAt");
CREATE TABLE "WebsiteOrderItem" (
  id uuid PRIMARY KEY,
  "organizationId" uuid NOT NULL,
  "locationId" uuid NOT NULL,
  "websiteOrderId" uuid NOT NULL,
  "productId" uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 49),
  "productName" text NOT NULL,
  "productSku" text NOT NULL,
  "unitPrice" numeric(18,4) NOT NULL CHECK ("unitPrice">=0 AND "unitPrice"<=99999999.9999),
  quantity numeric(18,3) NOT NULL CHECK (quantity>0 AND quantity<=9999.999),
  "lineTotal" numeric(18,2) NOT NULL CHECK ("lineTotal">=0 AND "lineTotal"<'Infinity'::numeric AND "lineTotal"=round("unitPrice"*quantity,2)),
  note text CHECK (length(note)<=1000),
  UNIQUE ("organizationId",id),
  UNIQUE ("organizationId","websiteOrderId",position),
  FOREIGN KEY ("organizationId","locationId","websiteOrderId") REFERENCES "WebsiteOrder"("organizationId","locationId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","productId") REFERENCES "Product"("organizationId",id) ON DELETE RESTRICT
);

CREATE FUNCTION public.protect_website_connection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 OR NOT EXISTS (
      SELECT 1 FROM public."CompanyUser" u JOIN public."Organization" o
        ON o.id=u."organizationId" AND o."primaryAdminUserId"=u.id
      WHERE u.id=NEW."createdByUserId" AND u."organizationId"=NEW."organizationId"
        AND u.status='ACTIVE' AND u."isPrimaryAdmin" AND o.status='ACTIVE'
    ) THEN RAISE EXCEPTION 'website connection requires an active primary administrator' USING ERRCODE='23514'; END IF;
  ELSIF NEW.version<>OLD.version+1 OR
    (to_jsonb(NEW)-ARRAY['name','status','version','updatedAt']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['name','status','version','updatedAt']) THEN
    RAISE EXCEPTION 'website connection context is immutable; increment version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_connection_version BEFORE INSERT OR UPDATE ON "WebsiteConnection"
  FOR EACH ROW EXECUTE FUNCTION public.protect_website_connection();

CREATE FUNCTION public.protect_website_key() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW."revokedAt" IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public."CompanyUser" u JOIN public."Organization" o
        ON o.id=u."organizationId" AND o."primaryAdminUserId"=u.id
      WHERE u.id=NEW."createdByUserId" AND u."organizationId"=NEW."organizationId"
        AND u.status='ACTIVE' AND u."isPrimaryAdmin" AND o.status='ACTIVE'
    ) THEN RAISE EXCEPTION 'website key requires an active primary administrator' USING ERRCODE='23514'; END IF;
  ELSIF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL OR
    (to_jsonb(NEW)-'revokedAt') IS DISTINCT FROM (to_jsonb(OLD)-'revokedAt') THEN
    RAISE EXCEPTION 'website keys can only be irreversibly revoked' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_key_history BEFORE INSERT OR UPDATE ON "WebsiteApiKey"
  FOR EACH ROW EXECUTE FUNCTION public.protect_website_key();

CREATE FUNCTION public.protect_website_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'PENDING' OR NEW.version<>1 OR NOT EXISTS (
      SELECT 1 FROM public."WebsiteApiKey" k
      JOIN public."WebsiteConnection" c ON c.id=k."connectionId" AND c."organizationId"=k."organizationId" AND c."locationId"=k."locationId"
      JOIN public."Organization" o ON o.id=k."organizationId"
      JOIN public."Location" l ON l.id=k."locationId" AND l."organizationId"=k."organizationId"
      JOIN public."CompanyUser" u ON u.id=k."createdByUserId" AND u."organizationId"=k."organizationId"
      WHERE k.id=NEW."createdWithKeyId" AND k."organizationId"=NEW."organizationId"
        AND k."locationId"=NEW."locationId" AND k."connectionId"=NEW."connectionId"
        AND k."revokedAt" IS NULL AND k."expiresAt">CURRENT_TIMESTAMP
        AND c.status='ACTIVE' AND o.status='ACTIVE' AND l.status='ACTIVE'
        AND u.status='ACTIVE' AND u."isPrimaryAdmin" AND o."primaryAdminUserId"=u.id
    ) THEN RAISE EXCEPTION 'website inbox requires a live scoped key and pending initial state' USING ERRCODE='23514'; END IF;
  ELSIF OLD.status<>'PENDING' OR NEW.status NOT IN ('ACCEPTED','REJECTED') OR NEW.version<>OLD.version+1 OR
    (to_jsonb(NEW)-ARRAY['status','version','orderId','decisionByUserId','decidedAt','rejectionReason','updatedAt']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','version','orderId','decisionByUserId','decidedAt','rejectionReason','updatedAt']) THEN
    RAISE EXCEPTION 'website snapshot is immutable and decision is terminal' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_order_history BEFORE INSERT OR UPDATE ON "WebsiteOrder"
  FOR EACH ROW EXECUTE FUNCTION public.protect_website_order();

CREATE FUNCTION public.validate_website_order_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parent_xmin xid; product_name text; product_sku text; local_price numeric;
BEGIN
  SELECT xmin INTO parent_xmin FROM public."WebsiteOrder"
    WHERE id=NEW."websiteOrderId" AND "organizationId"=NEW."organizationId"
      AND "locationId"=NEW."locationId" AND status='PENDING';
  IF parent_xmin IS NULL OR parent_xmin::text<>pg_current_xact_id()::text THEN
    RAISE EXCEPTION 'website order items must be sealed with the initial inbox entry' USING ERRCODE='23514';
  END IF;
  SELECT p.name,p.sku,lp.price INTO product_name,product_sku,local_price
    FROM public."Product" p JOIN public."LocationProduct" lp
      ON lp."productId"=p.id AND lp."organizationId"=p."organizationId"
    WHERE p.id=NEW."productId" AND p."organizationId"=NEW."organizationId"
      AND lp."locationId"=NEW."locationId" AND p.status='ACTIVE' AND lp.enabled;
  IF local_price IS NULL OR (NEW."productName",NEW."productSku",NEW."unitPrice")
    IS DISTINCT FROM (product_name,product_sku,local_price) THEN
    RAISE EXCEPTION 'website product snapshots must match the active location catalog' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_order_item_creation BEFORE INSERT ON "WebsiteOrderItem"
  FOR EACH ROW EXECUTE FUNCTION public.validate_website_order_item();
CREATE TRIGGER website_order_item_history BEFORE UPDATE OR DELETE ON "WebsiteOrderItem"
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mutation();

CREATE FUNCTION public.check_website_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE inbox public."WebsiteOrder"; local_order public."Order"; order_xmin xid;
  item_count bigint; local_count bigint; items_total numeric;
BEGIN
  SELECT * INTO inbox FROM public."WebsiteOrder" WHERE id=NEW.id AND "organizationId"=NEW."organizationId";
  SELECT count(*),sum("lineTotal") INTO item_count,items_total FROM public."WebsiteOrderItem"
    WHERE "websiteOrderId"=inbox.id AND "organizationId"=inbox."organizationId";
  IF item_count NOT BETWEEN 1 AND 50 OR inbox.total IS DISTINCT FROM items_total THEN
    RAISE EXCEPTION 'website inbox requires 1 to 50 items and their exact total' USING ERRCODE='23514';
  END IF;
  IF inbox.status<>'ACCEPTED' THEN RETURN NULL; END IF;
  SELECT * INTO local_order FROM public."Order"
    WHERE id=inbox."orderId" AND "organizationId"=inbox."organizationId" AND "locationId"=inbox."locationId" FOR UPDATE;
  SELECT xmin INTO order_xmin FROM public."Order" WHERE id=local_order.id AND "organizationId"=inbox."organizationId";
  IF local_order.id IS NULL OR local_order.status<>'DRAFT' OR local_order."kitchenStatus"<>'NOT_SENT'
    OR local_order.version<>1 OR order_xmin::text<>pg_current_xact_id()::text
    OR local_order."tableLabel" IS NOT NULL OR local_order.notes IS NOT NULL
    OR (local_order."serviceType",local_order.currency,local_order.total,local_order."createdByUserId",local_order."updatedByUserId") IS DISTINCT FROM
       (inbox."serviceType",inbox.currency,inbox.total,inbox."decisionByUserId",inbox."decisionByUserId") THEN
    RAISE EXCEPTION 'website acceptance requires a new matching operator draft in the same transaction' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO local_count FROM public."OrderItem"
    WHERE "orderId"=inbox."orderId" AND "organizationId"=inbox."organizationId";
  IF local_count<>item_count OR EXISTS (
    SELECT 1 FROM public."WebsiteOrderItem" w LEFT JOIN public."OrderItem" i
      ON i."organizationId"=w."organizationId" AND i."orderId"=inbox."orderId" AND i.position=w.position
    WHERE w."websiteOrderId"=inbox.id AND w."organizationId"=inbox."organizationId"
      AND (w."productId",w."productName",w."productSku",w."unitPrice",w.quantity,w."lineTotal",w.note)
      IS DISTINCT FROM (i."productId",i."productName",i."productSku",i."unitPrice",i.quantity,i."lineTotal",i.note)
  ) THEN RAISE EXCEPTION 'accepted POS draft must preserve all website item snapshots' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER website_order_complete AFTER INSERT OR UPDATE ON "WebsiteOrder"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_website_order();

DO $website_security$
DECLARE table_name text; expression text := '"organizationId"=nullif(current_setting(''app.organization_id'',true),'''')::uuid';
BEGIN
  FOREACH table_name IN ARRAY ARRAY['WebsiteConnection','WebsiteApiKey','WebsiteOrder','WebsiteOrderItem'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO pos_runtime USING (%s) WITH CHECK (%s)',table_name,expression,expression);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,pos_auth,pos_platform,pos_worker,pos_internal',table_name);
    EXECUTE format('GRANT SELECT,INSERT ON %I TO pos_runtime',table_name);
  END LOOP;
END $website_security$;
GRANT UPDATE ON "WebsiteConnection","WebsiteApiKey","WebsiteOrder" TO pos_runtime;
REVOKE ALL ON FUNCTION public.protect_website_connection(),public.protect_website_key(),public.protect_website_order(),
  public.validate_website_order_item(),public.check_website_order() FROM PUBLIC;

-- NOLOGIN internal identity gets only the columns needed by this one credential lookup.
GRANT SELECT (id,"organizationId","locationId","connectionId","secretHash","expiresAt","revokedAt","createdByUserId") ON "WebsiteApiKey" TO pos_internal;
GRANT SELECT (id,"organizationId","locationId",status) ON "WebsiteConnection" TO pos_internal;
GRANT SELECT (id,"organizationId",status) ON "Location" TO pos_internal;
CREATE POLICY internal_website_key ON "WebsiteApiKey" FOR SELECT TO pos_internal USING (true);
CREATE POLICY internal_website_connection ON "WebsiteConnection" FOR SELECT TO pos_internal USING (true);
CREATE POLICY internal_website_location ON "Location" FOR SELECT TO pos_internal USING (true);
CREATE FUNCTION pos_auth.lookup_website_key(key_id uuid,secret_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('keyId',k.id,'organizationId',k."organizationId",'locationId',k."locationId",
    'connectionId',k."connectionId",'createdByUserId',k."createdByUserId",'expiresAt',k."expiresAt")
  FROM public."WebsiteApiKey" k
  JOIN public."WebsiteConnection" c ON c.id=k."connectionId" AND c."organizationId"=k."organizationId" AND c."locationId"=k."locationId"
  JOIN public."Organization" o ON o.id=k."organizationId"
  JOIN public."Location" l ON l.id=k."locationId" AND l."organizationId"=k."organizationId"
  JOIN public."CompanyUser" u ON u.id=k."createdByUserId" AND u."organizationId"=k."organizationId"
  WHERE k.id=key_id AND k."secretHash"=secret_hash AND k."revokedAt" IS NULL AND k."expiresAt">now()
    AND c.status='ACTIVE' AND o.status='ACTIVE' AND l.status='ACTIVE'
    AND u.status='ACTIVE' AND u."isPrimaryAdmin" AND o."primaryAdminUserId"=u.id
  LIMIT 1
$$;
GRANT CREATE ON SCHEMA pos_auth TO pos_internal;
ALTER FUNCTION pos_auth.lookup_website_key(uuid,text) OWNER TO pos_internal;
SET LOCAL ROLE pos_internal;
REVOKE ALL ON FUNCTION pos_auth.lookup_website_key(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos_auth.lookup_website_key(uuid,text) TO pos_auth;
RESET ROLE;
REVOKE CREATE ON SCHEMA pos_auth FROM pos_internal;

INSERT INTO "Permission"(key,label,"scopeTypes",delegable)
  VALUES ('website.integrations.manage','Administrarea integrării website',ARRAY['ORGANIZATION']::text[],false);
COMMIT;
