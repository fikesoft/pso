import { describe, expect, it } from 'vitest';
import { consumedQuantity, movementQuantity, quantityString, quantityUnits } from './quantities';

describe('cantități inventar exacte', () => {
  it('păstrează toate cele șase zecimale ale consumului 3×3', () => {
    expect(consumedQuantity('1.234', '0.333')).toBe('-0.410922');
    expect(consumedQuantity('0.001', '0.001')).toBe('-0.000001');
    expect(consumedQuantity('9999.999', '999999.999')).toBe('-9999998990.000001');
  });
  it('adună și scade valori mari fără Number', () => {
    const maximum = quantityUnits('999999999999.999999');
    expect(quantityString(maximum - 1n)).toBe('999999999999.999998');
    expect(quantityString(quantityUnits('-2.500000') + quantityUnits('0.333333'))).toBe(
      '-2.166667',
    );
    expect(quantityString(0n)).toBe('0.000000');
  });
  it('refuză depășirea numeric18,6 în ambele direcții', () => {
    expect(movementQuantity(999999999999999999n)).toBe('999999999999.999999');
    expect(() => movementQuantity(1000000000000000000n)).toThrow();
    expect(() => movementQuantity(-1000000000000000000n)).toThrow();
  });
});
