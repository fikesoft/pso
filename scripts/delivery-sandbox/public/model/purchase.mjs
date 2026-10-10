import { pendingPurchaseKey } from '../config/client.constants.mjs';

export function readPending() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(pendingPurchaseKey) || 'null');
    if (!value || typeof value !== 'object') return null;
    if (
      !['requestKey', 'externalOrderId', 'externalLocationCode', 'expectedTotal'].every(
        (field) => typeof value.purchase?.[field] === 'string',
      ) ||
      (typeof value.purchase?.externalProductId !== 'string' &&
        !Array.isArray(value.purchase?.items))
    )
      return null;
    return { purchase: value.purchase, uncertain: value.uncertain === true };
  } catch {
    return null;
  }
}

export function savePending(value) {
  try {
    if (value) window.sessionStorage.setItem(pendingPurchaseKey, JSON.stringify(value));
    else window.sessionStorage.removeItem(pendingPurchaseKey);
  } catch {
    // The in-memory intent remains retryable even when browser storage is unavailable.
  }
}

export function newPurchase(product, locationCode) {
  const requestKey = window.crypto.randomUUID();
  return {
    requestKey,
    externalOrderId: `local-${requestKey}`,
    externalProductId: product.externalProductId,
    externalLocationCode: locationCode,
    expectedTotal: product.unitTotal,
  };
}

export function newCartPurchase(items, locationCode, expectedTotal) {
  const requestKey = window.crypto.randomUUID();
  return {
    requestKey,
    externalOrderId: `local-${requestKey}`,
    externalLocationCode: locationCode,
    expectedTotal,
    items,
  };
}
