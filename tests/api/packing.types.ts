import type { preparePacking } from './packing-setup';
export type PackingFixture = Awaited<ReturnType<typeof preparePacking>>;
