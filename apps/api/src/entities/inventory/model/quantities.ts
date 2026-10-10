import { assert } from '../../../shared/lib/http';
import { decimalString, decimalUnits } from '../../../shared/lib/money';
import {
  COMPONENT_SCALE,
  INVENTORY_SCALE,
  MAX_MOVEMENT_UNITS,
} from '../config/inventory.constants';

export function quantityUnits(value: string): bigint {
  return value.startsWith('-')
    ? -decimalUnits(value.slice(1), INVENTORY_SCALE)
    : decimalUnits(value, INVENTORY_SCALE);
}
export function quantityString(value: bigint): string {
  return value < 0n
    ? `-${decimalString(-value, INVENTORY_SCALE)}`
    : decimalString(value, INVENTORY_SCALE);
}
export function movementQuantity(value: bigint): string {
  assert(
    value >= -MAX_MOVEMENT_UNITS && value <= MAX_MOVEMENT_UNITS,
    400,
    'Mișcarea depășește limita cantitativă permisă',
  );
  return quantityString(value);
}
export function consumedQuantity(orderQuantity: string, perUnit: string): string {
  return movementQuantity(
    -decimalUnits(orderQuantity, COMPONENT_SCALE) * decimalUnits(perUnit, COMPONENT_SCALE),
  );
}
