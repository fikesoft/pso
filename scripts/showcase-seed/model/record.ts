import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SHOWCASE } from '../config/seed.constants';
import { STAFF_PROFILES } from '../config/staff.constants';
import type { SeedRecord, SeedTarget } from './seed.types';

export function seedKey(record: Pick<SeedRecord, 'id'>, label: string) {
  const bytes = createHash('sha256').update(`${record.id}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 0x50;
  bytes[8] = (bytes[8]! & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function createSeedRecord(target: SeedTarget): SeedRecord {
  return {
    version: 1,
    id: randomUUID(),
    target,
    expiresAt: new Date(Date.now() + SHOWCASE.passwordHours * 3_600_000).toISOString(),
    platform: {
      id: randomUUID(),
      login: SHOWCASE.platformLogin,
      password: randomBytes(24).toString('base64url'),
    },
    companies: SHOWCASE.companies.map((company) => ({
      ...company,
      admin: { login: 'admin', password: randomBytes(24).toString('base64url') },
    })),
    users: SHOWCASE.locations.flatMap((_, location) =>
      STAFF_PROFILES.map((profile, index) => ({
        id: randomUUID(),
        profile: index,
        location,
        login: `${profile.login}-${SHOWCASE.locations[location]!.code.toLowerCase()}`,
        secret: profile.mfa
          ? randomBytes(24).toString('base64url')
          : randomBytes(6).toString('hex').toUpperCase(),
      })),
    ),
  };
}

export function parseSeedRecord(value: unknown): SeedRecord {
  const r = value as SeedRecord;
  const uuid = (v: unknown) =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  const password = (v: unknown) => typeof v === 'string' && v.length >= 12 && v.length <= 128;
  if (
    !r ||
    r.version !== 1 ||
    !uuid(r.id) ||
    !r.target ||
    !r.platform ||
    !uuid(r.platform.id) ||
    r.platform.login !== SHOWCASE.platformLogin ||
    !password(r.platform.password) ||
    !Number.isFinite(Date.parse(r.expiresAt)) ||
    !Array.isArray(r.companies) ||
    r.companies.length !== 2 ||
    r.companies.some(
      (c, i) =>
        c?.slug !== SHOWCASE.companies[i]!.slug ||
        c.name !== SHOWCASE.companies[i]!.name ||
        c.admin?.login !== 'admin' ||
        !password(c.admin.password),
    ) ||
    !Array.isArray(r.users) ||
    r.users.length !== SHOWCASE.locations.length * STAFF_PROFILES.length ||
    r.users.some(
      (u, i) =>
        !u ||
        !uuid(u.id) ||
        u.profile !== i % STAFF_PROFILES.length ||
        u.location !== Math.floor(i / STAFF_PROFILES.length) ||
        u.login !==
          `${STAFF_PROFILES[u.profile]!.login}-${SHOWCASE.locations[u.location]!.code.toLowerCase()}` ||
        (STAFF_PROFILES[u.profile]!.mfa ? !password(u.secret) : !/^[A-F0-9]{12}$/.test(u.secret)),
    ) ||
    new Set([r.id, r.platform.id, ...r.users.map((u) => u.id)]).size !== r.users.length + 2
  )
    throw new Error('Manifestul seedului nu este valid.');
  return r;
}
