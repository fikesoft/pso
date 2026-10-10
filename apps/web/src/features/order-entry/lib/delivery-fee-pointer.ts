import { orderDeliveryFeeResolutionSchema } from '@pos/contracts/delivery-zones';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
export function readDeliveryFeePointer(key: string) {
  const value = sessionStorage.getItem(key);
  if (value === null) return null;
  try {
    return orderDeliveryFeeResolutionSchema.parse(JSON.parse(value)).requestKey;
  } catch {
    throw new Error(text.invalidPointer);
  }
}
export function storeDeliveryFeePointer(key: string, requestKey: string) {
  const prior = readDeliveryFeePointer(key);
  if (prior && prior !== requestKey) throw new Error(text.storageConflict);
  sessionStorage.setItem(
    key,
    JSON.stringify(orderDeliveryFeeResolutionSchema.parse({ requestKey })),
  );
  if (readDeliveryFeePointer(key) !== requestKey) throw new Error(text.storageError);
}
export function clearDeliveryFeePointer(key: string, requestKey: string) {
  const prior = readDeliveryFeePointer(key);
  if (prior && prior !== requestKey) throw new Error(text.storageConflict);
  sessionStorage.removeItem(key);
  if (sessionStorage.getItem(key) !== null) throw new Error(text.storageError);
}
