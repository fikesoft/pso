import { expect, it } from 'vitest';
import { MEDIA_CONCURRENT_UPLOADS } from '../config/media.constants';
import { reserveUpload } from './upload-admission';

it('admite un număr limitat de corpuri brute și eliberează fiecare slot o singură dată', () => {
  const reservations = Array.from({ length: MEDIA_CONCURRENT_UPLOADS }, () => reserveUpload());
  expect(() => reserveUpload()).toThrowError(expect.objectContaining({ status: 429 }));
  reservations[0]!.responseClosed();
  reservations[0]!.settle();
  const last = reserveUpload();
  last.settle();
  for (const reservation of reservations) reservation.settle();
});

it('ține slotul după deconectarea clientului cât timp procesarea este activă', () => {
  const reservations = Array.from({ length: MEDIA_CONCURRENT_UPLOADS }, () => reserveUpload());
  const pending = reservations[0]!;
  expect(pending.enter()).toBe(true);
  pending.responseClosed();
  expect(() => reserveUpload()).toThrowError(expect.objectContaining({ status: 429 }));
  pending.settle();
  const replacement = reserveUpload();
  replacement.settle();
  for (const reservation of reservations) reservation.settle();
});

it('eliberează slotul dacă clientul se deconectează înainte de handler', () => {
  const pending = reserveUpload();
  pending.responseClosed();
  expect(pending.enter()).toBe(false);
  const next = reserveUpload();
  next.settle();
});
