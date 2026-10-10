BEGIN;
ALTER TABLE public."Location" ADD CONSTRAINT location_coordinate_pair_check
  CHECK ((latitude IS NULL) = (longitude IS NULL));
COMMIT;
