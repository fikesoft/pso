import type { prepareWebsite } from './website-setup';
export type WebsiteFixture = Awaited<ReturnType<typeof prepareWebsite>>;
export type WebsiteActor = 'operator' | 'reader' | 'limited';
