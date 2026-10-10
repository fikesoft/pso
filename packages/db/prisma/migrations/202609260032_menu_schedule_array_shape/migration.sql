BEGIN;
ALTER TABLE public."MenuSchedule" ADD CONSTRAINT menu_schedule_weekdays_dimension
 CHECK (array_ndims(weekdays)=1);
COMMIT;
