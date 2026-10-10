import type { preparePinFixture } from './pin-setup';
export type PinFixture = Awaited<ReturnType<typeof preparePinFixture>>;
