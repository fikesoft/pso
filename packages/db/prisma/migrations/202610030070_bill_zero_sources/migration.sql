BEGIN;
-- Free orders remain in the immutable visit snapshot; they require no payment allocation.
ALTER TABLE "BillSplitSource" DROP CONSTRAINT "BillSplitSource_amount_check",
 ADD CONSTRAINT "BillSplitSource_amount_check" CHECK (amount>=0);
COMMIT;
