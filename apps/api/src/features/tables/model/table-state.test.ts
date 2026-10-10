import { expect, it } from 'vitest';
import { deriveVisitState } from './table-state';

it('vizita închisă nu ocupă masa din cauza preparatelor istorice', () => {
  const orders = [{ status: 'READY', kitchenStatus: 'READY' }] as const;
  for (const visit of [null, { status: 'CLOSED', billRequested: false }] as const)
    expect(deriveVisitState(visit, orders)).toEqual({
      state: 'FREE',
      hasReadyFood: false,
      hasWaitingFood: false,
    });
});

it('prepararea parțială păstrează simultan cele două semnale, inclusiv cu nota solicitată', () => {
  const orders = [{ status: 'IN_PROGRESS', kitchenStatus: 'PARTIALLY_READY' }] as const;
  expect(deriveVisitState({ status: 'OPEN', billRequested: false }, orders)).toEqual({
    state: 'READY',
    hasReadyFood: true,
    hasWaitingFood: true,
  });
  expect(deriveVisitState({ status: 'OPEN', billRequested: true }, orders)).toEqual({
    state: 'PAYMENT_REQUESTED',
    hasReadyFood: true,
    hasWaitingFood: true,
  });
});

it('comenzile terminale nu contribuie la semnale, dar vizita rămâne ocupată explicit', () => {
  expect(
    deriveVisitState({ status: 'OPEN', billRequested: false }, [
      { status: 'COMPLETED', kitchenStatus: 'READY' },
      { status: 'CANCELLED', kitchenStatus: 'PREPARING' },
      { status: 'DRAFT', kitchenStatus: 'NOT_SENT' },
    ]),
  ).toEqual({ state: 'OCCUPIED', hasReadyFood: false, hasWaitingFood: false });
});

it('trimiterea la bucătărie indică așteptare fără a declara preparatele gata', () => {
  expect(
    deriveVisitState({ status: 'OPEN', billRequested: false }, [
      { status: 'CONFIRMED', kitchenStatus: 'QUEUED' },
    ]),
  ).toEqual({ state: 'WAITING_FOOD', hasReadyFood: false, hasWaitingFood: true });
});
