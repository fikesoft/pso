import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { BillOperationIdentity, BillOperationResult } from '../model/bill-operation.types';
import { validateBillResult } from './bill-result';
it('rezultatul încasării trebuie să corespundă părții, cheii, locației și operatorului', () => {
  const actor = randomUUID();
  const identity: BillOperationIdentity = {
    family: 'COLLECTION',
    command: { locationId: randomUUID(), requestKey: randomUUID(), partId: randomUUID() },
  };
  const value: BillOperationResult = {
    family: 'COLLECTION',
    result: {
      collection: {
        ...identity.command,
        id: randomUUID(),
        actorUserId: actor,
        amount: '5.00',
        method: 'CARD',
        receivedAmount: '5.00',
        cashShiftId: randomUUID(),
        createdAt: new Date().toISOString(),
        operations: [],
      },
    },
  };
  expect(() => validateBillResult(identity, value, actor)).not.toThrow();
  for (const key of ['partId', 'locationId', 'requestKey', 'actorUserId'] as const)
    expect(() =>
      validateBillResult(
        identity,
        { ...value, result: { collection: { ...value.result.collection, [key]: randomUUID() } } },
        actor,
      ),
    ).toThrow();
});
it('crearea și anularea validează separat autorul și identitatea rezultatului', () => {
  const actor = randomUUID(),
    locationId = randomUUID(),
    requestKey = randomUUID(),
    orderId = randomUUID();
  const identity: BillOperationIdentity = {
    family: 'PLAN',
    command: { kind: 'CREATE', locationId, requestKey, context: { kind: 'ORDER', id: orderId } },
  };
  const value: BillOperationResult = {
    family: 'PLAN',
    result: {
      split: {
        id: randomUUID(),
        locationId,
        requestKey,
        actorUserId: actor,
        context: { kind: 'ORDER', id: orderId },
        status: 'ACTIVE',
        canVoid: true,
        voided: null,
        currency: 'MDL',
        total: '10.00',
        mode: 'EQUAL',
        createdAt: new Date().toISOString(),
        sources: [],
        parts: [],
      },
    },
  };
  expect(() => validateBillResult(identity, value, actor)).not.toThrow();
  expect(() => validateBillResult(identity, value, randomUUID())).toThrow();
  const voidIdentity: BillOperationIdentity = {
    family: 'PLAN',
    command: { kind: 'VOID', locationId, requestKey: randomUUID(), splitId: value.result.split.id },
  };
  expect(() => validateBillResult(voidIdentity, value, actor)).toThrow();
  value.result.split.status = 'VOIDED';
  value.result.split.voided = {
    id: randomUUID(),
    requestKey: voidIdentity.command.requestKey,
    actorUserId: actor,
    reason: 'Refacere',
    createdAt: new Date().toISOString(),
  };
  expect(() => validateBillResult(voidIdentity, value, actor)).not.toThrow();
  value.result.split.voided.requestKey = randomUUID();
  expect(() => validateBillResult(voidIdentity, value, actor)).toThrow();
});
