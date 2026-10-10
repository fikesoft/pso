import { z } from 'zod';

const supportedYear = (year: number) => year >= 1 && year <= 9998;

/** YYYY-MM-DD usable with a following local midnight in PostgreSQL. */
export const businessDateSchema = z.iso
  .date()
  .refine(
    (value) => supportedYear(Number(value.slice(0, 4))),
    'Anul datei trebuie să fie între 0001 și 9998.',
  );

/** Offset-aware instant accepted by PostgreSQL and Prisma date filters. */
export const businessTimestampSchema = z.iso.datetime({ offset: true }).refine((value) => {
  const instant = new Date(value);
  return (
    supportedYear(Number(value.slice(0, 4))) &&
    !Number.isNaN(instant.getTime()) &&
    supportedYear(instant.getUTCFullYear())
  );
}, 'Anul momentului trebuie să fie între 0001 și 9998.');
