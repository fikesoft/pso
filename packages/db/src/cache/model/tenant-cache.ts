import type { TenantTransaction } from '../../model/database.types';
import { CACHE_LIMITS } from '../config/cache.constants';
import type { TenantCacheAddress, TenantCacheRow, TenantCacheWrite } from './cache.types';

function validateAddress(address: TenantCacheAddress) {
  if (
    !CACHE_LIMITS.namespacePattern.test(address.namespace) ||
    typeof address.key !== 'string' ||
    address.key.length === 0 ||
    address.key.length > CACHE_LIMITS.keyLength
  ) {
    throw new Error('Adresa cache-ului nu este validă.');
  }
}

/** Call after live authorization, inside withTenantTransaction; never cache access decisions. */
export async function readTenantCache(tx: TenantTransaction, address: TenantCacheAddress) {
  validateAddress(address);
  const rows = await tx.$queryRaw<TenantCacheRow[]>`
    SELECT value FROM public."TenantCacheEntry"
    WHERE "organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid
      AND namespace=${address.namespace} AND key=${address.key}
      AND "expiresAt">clock_timestamp()`;
  return rows[0]?.value ?? null;
}

export async function writeTenantCache(tx: TenantTransaction, input: TenantCacheWrite) {
  validateAddress(input);
  if (
    !Number.isInteger(input.ttlSeconds) ||
    input.ttlSeconds < 1 ||
    input.ttlSeconds > CACHE_LIMITS.maxTtlSeconds ||
    !input.value ||
    typeof input.value !== 'object' ||
    Array.isArray(input.value)
  ) {
    throw new Error('Valoarea sau durata cache-ului nu este validă.');
  }
  const serialized = JSON.stringify(input.value);
  if (Buffer.byteLength(serialized, 'utf8') > CACHE_LIMITS.maxBytes) {
    throw new Error('Valoarea cache-ului depășește limita permisă.');
  }
  await tx.$executeRaw`
    WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS now)
    INSERT INTO public."TenantCacheEntry"("organizationId",namespace,key,value,"writtenAt","expiresAt")
    SELECT nullif(current_setting('app.organization_id',true),'')::uuid,
      ${input.namespace},${input.key},${serialized}::jsonb,now,
      now+make_interval(secs=>${input.ttlSeconds}::integer) FROM moment
    ON CONFLICT ("organizationId",namespace,key) DO UPDATE
      SET value=EXCLUDED.value,"writtenAt"=EXCLUDED."writtenAt","expiresAt"=EXCLUDED."expiresAt"`;
}

export async function invalidateTenantCache(tx: TenantTransaction, address: TenantCacheAddress) {
  validateAddress(address);
  return tx.$executeRaw`
    DELETE FROM public."TenantCacheEntry"
    WHERE "organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid
      AND namespace=${address.namespace} AND key=${address.key}`;
}

/** Bounded cleanup of expired entries belonging to the current tenant only. */
export async function pruneTenantCache(tx: TenantTransaction) {
  return tx.$executeRaw`
    WITH expired AS (
      SELECT "organizationId",namespace,key FROM public."TenantCacheEntry"
      WHERE "organizationId"=nullif(current_setting('app.organization_id',true),'')::uuid
        AND "expiresAt"<=clock_timestamp()
      ORDER BY "expiresAt",namespace,key FOR UPDATE SKIP LOCKED
      LIMIT ${CACHE_LIMITS.pruneBatchSize}
    ) DELETE FROM public."TenantCacheEntry" c USING expired e
      WHERE c."organizationId"=e."organizationId" AND c.namespace=e.namespace AND c.key=e.key`;
}
