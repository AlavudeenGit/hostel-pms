-- ============================================================
-- Migration: Student form updates
-- Run this once in your Supabase project's SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run — every statement is guarded (IF NOT EXISTS /
-- conditional constraint drop), so running it twice won't error
-- or duplicate anything. No existing data is touched or deleted.
-- ============================================================

-- 1. Add the five new student fields.
alter table students add column if not exists admission_number text;
alter table students add column if not exists blood_group text;
alter table students add column if not exists category text;
alter table students add column if not exists caution_deposit numeric(10,2) default 0;
alter table students add column if not exists mess_deposit numeric(10,2) default 0;

-- Constrain category to the three valid values, without breaking any
-- existing row (existing rows have category = null, which the check
-- constraint allows).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_category_check'
  ) then
    alter table students add constraint students_category_check
      check (category is null or category in ('TN', 'KL', 'NM'));
  end if;
end $$;

-- 2. Loosen fields that are no longer mandatory in the form. Existing
-- rows already have values for these, so this only affects new/edited
-- records going forward — nothing existing is changed.
alter table students alter column aadhar_number drop not null;
alter table students alter column permanent_address drop not null;
alter table students alter column current_address drop not null;
alter table students alter column guardian_name drop not null;
alter table students alter column guardian_mobile drop not null;

-- Done. Verify with:
-- select column_name, is_nullable, data_type from information_schema.columns
-- where table_name = 'students' order by ordinal_position;
