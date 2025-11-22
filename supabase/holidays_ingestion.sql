-- Staging table for public holidays
create table if not exists staging_public_holidays (
  holiday_date date primary key,
  holiday_name text,
  holiday_period text
);

-- Example load:
-- \copy staging_public_holidays(holiday_date,holiday_name,holiday_period) from 'public-holidays-hk/holidays.csv' csv header;

-- Update dim_date flags
update dim_date d
set
  is_public_holiday = true,
  holiday_period = coalesce(sph.holiday_period, 'HOLIDAY')
from staging_public_holidays sph
where sph.holiday_date = d.date;

-- Optional: set weekends following holiday logic could be added here.
