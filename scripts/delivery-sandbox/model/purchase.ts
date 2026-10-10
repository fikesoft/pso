import type { Purchase } from './storefront.types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validItem(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(',') !== 'externalProductId,modifiers,quantity') return false;
  if (
    typeof item.externalProductId !== 'string' ||
    item.externalProductId.length < 1 ||
    item.externalProductId.length > 100 ||
    item.quantity !== '1.000' ||
    !Array.isArray(item.modifiers) ||
    item.modifiers.length > 10
  )
    return false;
  return item.modifiers.every((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const modifier = raw as Record<string, unknown>;
    return (
      Object.keys(modifier).sort().join(',') ===
        'bindingId,bindingVersion,groupVersion,optionIds' &&
      typeof modifier.bindingId === 'string' &&
      uuid.test(modifier.bindingId) &&
      Number.isInteger(modifier.bindingVersion) &&
      Number(modifier.bindingVersion) > 0 &&
      Number.isInteger(modifier.groupVersion) &&
      Number(modifier.groupVersion) > 0 &&
      Array.isArray(modifier.optionIds) &&
      modifier.optionIds.length <= 10 &&
      new Set(modifier.optionIds).size === modifier.optionIds.length &&
      modifier.optionIds.every((id: unknown) => typeof id === 'string' && uuid.test(id))
    );
  });
}

export function parsePurchase(value: unknown): Purchase | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data).sort().join(',');
  const legacy =
    keys === 'expectedTotal,externalLocationCode,externalOrderId,externalProductId,requestKey';
  const cart = keys === 'expectedTotal,externalLocationCode,externalOrderId,items,requestKey';
  if (!legacy && !cart) return null;
  if (
    typeof data.requestKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestKey)
  )
    return null;
  if (data.externalOrderId !== `local-${data.requestKey}`) return null;
  if (
    typeof data.externalLocationCode !== 'string' ||
    data.externalLocationCode.length < 1 ||
    data.externalLocationCode.length > 40
  )
    return null;
  if (
    legacy &&
    (typeof data.externalProductId !== 'string' ||
      data.externalProductId.length < 1 ||
      data.externalProductId.length > 100)
  )
    return null;
  if (
    cart &&
    (!Array.isArray(data.items) ||
      data.items.length < 1 ||
      data.items.length > 50 ||
      !data.items.every(validItem))
  )
    return null;
  if (typeof data.expectedTotal !== 'string' || !/^\d{1,16}\.\d{2}$/.test(data.expectedTotal))
    return null;
  return data as Purchase;
}
