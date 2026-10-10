import type { prepareFoundationScenario } from './foundation-setup';
export type FoundationScenario = Awaited<ReturnType<typeof prepareFoundationScenario>>;
