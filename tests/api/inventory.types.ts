import type { prepareInventory } from './inventory-setup';
export type InventoryFixture = Awaited<ReturnType<typeof prepareInventory>>;
export type InventoryActor = 'manager' | 'reader' | 'recipes' | 'denied';
