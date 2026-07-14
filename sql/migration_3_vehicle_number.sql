-- ============================================================
-- Migration: Add Vehicle Number to students
-- Run this once in your Supabase project's SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run — uses IF NOT EXISTS, so running it twice won't
-- error or duplicate anything. No existing data is touched.
-- ============================================================

alter table students add column if not exists vehicle_number text;

-- Done. Verify with:
-- select column_name, data_type from information_schema.columns
-- where table_name = 'students' and column_name = 'vehicle_number';
