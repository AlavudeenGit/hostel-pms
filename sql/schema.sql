-- ============================================================
-- Malabar Muslim Association Register — Database Schema (Supabase / PostgreSQL)
-- ============================================================
-- Run this once in the Supabase SQL editor on a fresh project.
-- Order matters (foreign keys reference earlier tables).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. hostel_settings — single row of key/value config
-- ------------------------------------------------------------
create table if not exists hostel_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into hostel_settings (key, value) values
  ('hostel_name', 'Malabar Muslim Association'),
  ('owner_name', ''),
  ('address', ''),
  ('phone', ''),
  ('student_rent_2', '4350'),
  ('student_rent_3', '3850'),
  ('employee_rent_2', '5350'),
  ('employee_rent_3', '4850'),
  ('bike_charge', '250'),
  ('mess_default', '1800')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. rooms
-- ------------------------------------------------------------
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  floor int not null,
  room_number int not null unique,
  room_type int not null check (room_type in (2, 3)),
  capacity int not null check (capacity in (2, 3)),
  occupied_beds int not null default 0,
  status text not null default 'available' check (status in ('available', 'full', 'maintenance')),
  created_at timestamptz not null default now()
);

create index if not exists idx_rooms_status on rooms(status);
create index if not exists idx_rooms_floor on rooms(floor);

-- ------------------------------------------------------------
-- 3. students (also holds employees, distinguished by `type`)
-- ------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text not null,
  alt_mobile text,
  email text,
  type text not null default 'student' check (type in ('student', 'employee')),
  room_id uuid references rooms(id) on delete set null,
  sharing_type int check (sharing_type in (2, 3)),
  mess_available boolean not null default false,
  mess_charge numeric(10,2),
  bike_available boolean not null default false,
  photo_url text,
  aadhar_number text not null,
  aadhar_front_url text,
  aadhar_back_url text,
  license_number text,
  license_url text,
  permanent_address text not null,
  current_address text not null,
  guardian_name text not null,
  guardian_mobile text not null,
  joining_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'vacated', 'blocked')),
  vacated_date date,
  vacated_reason text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_students_status on students(status);
create index if not exists idx_students_room on students(room_id);
create index if not exists idx_students_name on students using gin (to_tsvector('simple', name));
create index if not exists idx_students_mobile on students(mobile);
create index if not exists idx_students_aadhar on students(aadhar_number);

-- ------------------------------------------------------------
-- 4. room_history — tracks every room assignment
-- ------------------------------------------------------------
create table if not exists room_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  assigned_date date not null default current_date,
  vacated_date date
);

create index if not exists idx_room_history_student on room_history(student_id);

-- ------------------------------------------------------------
-- 5. payments — one row per student per month
-- ------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  month_year date not null, -- always stored as the 1st of the month
  room_rent numeric(10,2) not null default 0,
  bike_charge numeric(10,2) not null default 0,
  mess_charge numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  balance numeric(10,2) not null default 0,
  status text not null default 'pending' check (status in ('paid', 'partial', 'pending')),
  payment_method text check (payment_method in ('Cash', 'GPay', 'PhonePe', 'Bank Transfer', 'UPI')),
  transaction_number text,
  payment_date date,
  remarks text,
  created_at timestamptz not null default now(),
  unique (student_id, month_year)
);

create index if not exists idx_payments_student on payments(student_id);
create index if not exists idx_payments_status on payments(status);
create index if not exists idx_payments_month on payments(month_year);

-- ------------------------------------------------------------
-- 6. expenses
-- ------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in (
    'Electricity','Water','Internet','Cleaning','Gas','Furniture',
    'Repair','Painting','Building Maintenance','Staff Salary','Food','Miscellaneous'
  )),
  amount numeric(10,2) not null,
  expense_date date not null default current_date,
  paid_to text,
  payment_method text,
  bill_url text,
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on expenses(expense_date);
create index if not exists idx_expenses_category on expenses(category);

-- ------------------------------------------------------------
-- 7. workers
-- ------------------------------------------------------------
create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text not null,
  alt_mobile text,
  email text,
  position text not null,
  salary numeric(10,2) not null default 0,
  photo_url text,
  aadhar_number text,
  aadhar_url text,
  permanent_address text,
  current_address text,
  joining_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create index if not exists idx_workers_status on workers(status);

-- ------------------------------------------------------------
-- 8. worker_salaries — one row per worker per month
-- ------------------------------------------------------------
create table if not exists worker_salaries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  month_year date not null,
  base_salary numeric(10,2) not null default 0,
  advance numeric(10,2) not null default 0,
  overtime numeric(10,2) not null default 0,
  bonus numeric(10,2) not null default 0,
  leave_taken numeric(5,2) not null default 0,
  leave_deduction numeric(10,2) not null default 0,
  final_salary numeric(10,2) not null default 0,
  status text not null default 'pending' check (status in ('paid', 'pending')),
  payment_method text,
  payment_date date,
  remarks text,
  created_at timestamptz not null default now(),
  unique (worker_id, month_year)
);

create index if not exists idx_worker_salaries_worker on worker_salaries(worker_id);
create index if not exists idx_worker_salaries_status on worker_salaries(status);

-- ------------------------------------------------------------
-- 9. documents — optional central file registry
-- ------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  worker_id uuid references workers(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_type text,
  uploaded_at timestamptz not null default now()
);

-- ============================================================
-- TRIGGERS — automatic room occupancy management
-- ============================================================

-- Recompute a room's occupied_beds + status from its active students
create or replace function recompute_room(p_room_id uuid)
returns void language plpgsql as $$
declare
  v_occupied int;
  v_capacity int;
  v_current_status text;
begin
  if p_room_id is null then
    return;
  end if;

  select count(*) into v_occupied
  from students
  where room_id = p_room_id and status = 'active';

  select capacity, status into v_capacity, v_current_status
  from rooms where id = p_room_id;

  update rooms
  set occupied_beds = v_occupied,
      status = case
        when v_current_status = 'maintenance' then 'maintenance'
        when v_occupied >= v_capacity then 'full'
        else 'available'
      end
  where id = p_room_id;
end;
$$;

-- After inserting a student, log room_history and recompute the room
create or replace function trg_student_after_insert()
returns trigger language plpgsql as $$
begin
  if new.room_id is not null then
    insert into room_history (student_id, room_id, assigned_date)
    values (new.id, new.room_id, coalesce(new.joining_date, current_date));
    perform recompute_room(new.room_id);
  end if;
  return new;
end;
$$;

drop trigger if exists students_after_insert on students;
create trigger students_after_insert
  after insert on students
  for each row execute function trg_student_after_insert();

-- After updating a student (room change or vacate), recompute affected rooms
create or replace function trg_student_after_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();

  -- Vacating: close the open room_history row
  if old.status = 'active' and new.status = 'vacated' then
    update room_history
    set vacated_date = coalesce(new.vacated_date, current_date)
    where student_id = new.id and room_id = old.room_id and vacated_date is null;
  end if;

  -- Room reassignment while active
  if new.room_id is distinct from old.room_id then
    if old.room_id is not null then
      update room_history
      set vacated_date = current_date
      where student_id = new.id and room_id = old.room_id and vacated_date is null;
    end if;
    if new.room_id is not null and new.status = 'active' then
      insert into room_history (student_id, room_id, assigned_date)
      values (new.id, new.room_id, current_date);
    end if;
  end if;

  perform recompute_room(old.room_id);
  perform recompute_room(new.room_id);

  return new;
end;
$$;

drop trigger if exists students_before_update on students;
create trigger students_before_update
  before update on students
  for each row execute function trg_student_after_update();

-- Enforce capacity at the database level too (belt & braces on top of the app check)
create or replace function trg_student_before_insert_capacity()
returns trigger language plpgsql as $$
declare
  v_capacity int;
  v_occupied int;
  v_room_status text;
begin
  if new.room_id is null then
    return new;
  end if;

  select capacity, occupied_beds, status into v_capacity, v_occupied, v_room_status
  from rooms where id = new.room_id;

  if v_room_status = 'maintenance' then
    raise exception 'Room is under maintenance and cannot accept new occupants';
  end if;

  if new.status = 'active' and v_occupied >= v_capacity then
    raise exception 'Room is already at full capacity';
  end if;

  return new;
end;
$$;

drop trigger if exists students_before_insert_capacity on students;
create trigger students_before_insert_capacity
  before insert on students
  for each row execute function trg_student_before_insert_capacity();

-- Keep payments.balance / status in sync whenever amount_paid or total_amount changes
create or replace function trg_payments_before_write()
returns trigger language plpgsql as $$
begin
  new.total_amount := coalesce(new.room_rent,0) + coalesce(new.bike_charge,0) + coalesce(new.mess_charge,0);
  new.balance := new.total_amount - coalesce(new.amount_paid,0);
  new.status := case
    when new.amount_paid <= 0 then 'pending'
    when new.amount_paid >= new.total_amount then 'paid'
    else 'partial'
  end;
  return new;
end;
$$;

drop trigger if exists payments_before_write on payments;
create trigger payments_before_write
  before insert or update on payments
  for each row execute function trg_payments_before_write();

-- Keep worker_salaries.final_salary in sync
create or replace function trg_worker_salaries_before_write()
returns trigger language plpgsql as $$
begin
  new.leave_deduction := coalesce(new.leave_deduction, 0);
  new.final_salary := coalesce(new.base_salary,0) + coalesce(new.overtime,0) + coalesce(new.bonus,0)
                       - coalesce(new.advance,0) - coalesce(new.leave_deduction,0);
  return new;
end;
$$;

drop trigger if exists worker_salaries_before_write on worker_salaries;
create trigger worker_salaries_before_write
  before insert or update on worker_salaries
  for each row execute function trg_worker_salaries_before_write();

-- ============================================================
-- FUNCTIONS — monthly payment generation & dashboard chart RPC
-- ============================================================

-- Generate this month's payment rows for every active student who
-- doesn't already have one. Safe to call repeatedly (idempotent).
create or replace function generate_monthly_payments(p_month date default date_trunc('month', current_date)::date)
returns int language plpgsql as $$
declare
  v_count int := 0;
  r record;
  v_bike_charge numeric;
  v_mess_default numeric;
  v_rent numeric;
begin
  select value::numeric into v_bike_charge from hostel_settings where key = 'bike_charge';
  select value::numeric into v_mess_default from hostel_settings where key = 'mess_default';

  for r in
    select s.id as student_id, s.type, s.sharing_type, s.bike_available, s.mess_available, s.mess_charge
    from students s
    where s.status = 'active'
  loop
    select value::numeric into v_rent
    from hostel_settings
    where key = (
      case
        when r.type = 'employee' and r.sharing_type = 2 then 'employee_rent_2'
        when r.type = 'employee' and r.sharing_type = 3 then 'employee_rent_3'
        when r.type = 'student' and r.sharing_type = 2 then 'student_rent_2'
        else 'student_rent_3'
      end
    );

    -- Mess charge is per-student: use the student's own mess_charge if
    -- they have one set, otherwise fall back to the hostel-wide default.
    -- This must never read one shared value for every student.
    insert into payments (student_id, month_year, room_rent, bike_charge, mess_charge, amount_paid)
    values (
      r.student_id,
      p_month,
      coalesce(v_rent, 0),
      case when r.bike_available then coalesce(v_bike_charge, 0) else 0 end,
      case when r.mess_available then coalesce(r.mess_charge, v_mess_default, 0) else 0 end,
      0
    )
    on conflict (student_id, month_year) do nothing;

    get diagnostics v_count = v_count + row_count;
  end loop;

  return v_count;
end;
$$;

-- Powers the dashboard's income-vs-expense chart (last 6 months)
create or replace function monthly_income_expense()
returns table (labels text, income numeric, expense numeric, month_start date) language sql as $$
  with months as (
    select date_trunc('month', current_date) - (n || ' month')::interval as month_start
    from generate_series(5, 0, -1) as n
  ),
  income as (
    select date_trunc('month', month_year) as m, sum(amount_paid) as total
    from payments group by 1
  ),
  expense as (
    select date_trunc('month', expense_date) as m, sum(amount) as total
    from expenses group by 1
  )
  select
    to_char(m.month_start, 'Mon') as labels,
    coalesce(i.total, 0) as income,
    coalesce(e.total, 0) as expense,
    m.month_start::date
  from months m
  left join income i on i.m = m.month_start
  left join expense e on e.m = m.month_start
  order by m.month_start;
$$;

-- ============================================================
-- ROW LEVEL SECURITY — single authenticated admin
-- ============================================================
alter table hostel_settings enable row level security;
alter table rooms enable row level security;
alter table students enable row level security;
alter table room_history enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table workers enable row level security;
alter table worker_salaries enable row level security;
alter table documents enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['hostel_settings','rooms','students','room_history','payments','expenses','workers','worker_salaries','documents']
  loop
    execute format('drop policy if exists "authenticated_full_access" on %I;', t);
    execute format(
      'create policy "authenticated_full_access" on %I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- ============================================================
-- STORAGE — buckets for photos, Aadhar/license images, bills
-- ============================================================
insert into storage.buckets (id, name, public)
values ('hostel-documents', 'hostel-documents', true)
on conflict (id) do nothing;

drop policy if exists "authenticated_manage_documents" on storage.objects;
create policy "authenticated_manage_documents" on storage.objects
  for all to authenticated
  using (bucket_id = 'hostel-documents')
  with check (bucket_id = 'hostel-documents');

-- ============================================================
-- Done. Next: create your first admin user under
-- Authentication → Users, then point js/config.js at this project.
-- ============================================================
