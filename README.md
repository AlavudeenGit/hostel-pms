# Malabar Muslim Association Register — Complete Hostel / PG Management System

A production-oriented, single-admin Hostel/PG management system: rooms,
students/employees, workers, payments, expenses, salaries, reports, and
settings — all in one dashboard. Runs against Supabase (Postgres + Auth +
Storage), and also runs standalone in **demo mode** (data persisted to
`localStorage`) so you can review and click through everything before
connecting a database.

## Folder structure

```
hostel-pms/
├─ index.html          Dashboard — stat cards, charts, Room Key Rack, activity feed
├─ login.html          Admin sign-in
├─ rooms.html           Room grid, add room, mark maintenance/available
├─ students.html         Active/Vacated tabs, add student, profile slide-over, vacate flow
├─ workers.html          Staff list + this month's salary entry (advance/overtime/bonus/leave)
├─ payments.html         All/Pending tabs, generate monthly payments, collect payment, receipt
├─ expenses.html         Expense log, category breakdown chart, bill upload
├─ reports.html          11 exportable reports (CSV / Excel / PDF)
├─ settings.html         Hostel details + rent/charge configuration
│
├─ sql/
│  └─ schema.sql         Full Postgres schema: tables, constraints, indexes,
│                        RLS policies, triggers (room occupancy sync, payment/
│                        salary status), and the dashboard's monthly_income_expense RPC
│
├─ css/
│  ├─ tokens.css         Design tokens — color, type, spacing (light + dark theme)
│  ├─ base.css           Resets, fonts, global typography
│  ├─ layout.css         App shell: sidebar, topbar, responsive grid
│  ├─ components.css     Cards, buttons, badges, tables, toasts
│  ├─ forms.css          Form fields, file upload, filter toolbar, tabs, pagination
│  ├─ modal.css          Modal dialogs + slide-over panel (student profile)
│  └─ dashboard.css      Charts panel + the "Key Rack" room-status visual
│
├─ js/
│  ├─ config.js           ← put your Supabase URL + anon key here
│  ├─ supabaseClient.js    Initializes the Supabase client
│  ├─ auth.js              Sign in / session guard / sign out
│  ├─ db.js                Data service layer — every CRUD operation in the
│  │                       app goes through here. Talks to Supabase when
│  │                       configured, otherwise to mockDb.js.
│  ├─ mockDb.js             Demo-mode "database" — seeds realistic data into
│  │                       localStorage so every page works before Supabase is wired up
│  ├─ storage.js            File uploads (Supabase Storage, or local object
│  │                       URLs in demo mode)
│  ├─ export.js             CSV / Excel (SheetJS) / PDF (jsPDF) export helpers
│  ├─ shell.js              Renders the sidebar + topbar on every page (single
│  │                       source of truth for navigation)
│  ├─ modal.js              Modal, confirm dialog, and slide-over panel helpers
│  ├─ theme.js              Dark/light mode, persisted to localStorage
│  ├─ toast.js              Toast notifications
│  ├─ utils.js              Formatting helpers (currency, dates, etc.)
│  ├─ dashboard.js          Dashboard page logic
│  ├─ rooms.js, students.js, workers.js, payments.js, expenses.js,
│  │  reports.js, settings.js   Page-specific logic for each module
└─ assets/                (empty — for a logo/images later)
```

## Design direction

The visual concept is a **digital reception register**: ink-navy sidebar,
brass "hardware" accents, and ledger-red/green/amber for dues, paid, and
pending — the same color logic a warden's paper ledger would use in
red/green ink. The signature piece is the **Room Key Rack** on the
dashboard: every room hangs as a color-coded key tag, exactly like the
physical board at a hostel reception desk.

## Running it

No build step. Open `login.html` directly, or serve the folder:

```bash
npx serve hostel-pms
```

Sign in with **any email + password** — in demo mode the form accepts
anything, and every page (Rooms, Students, Workers, Payments, Expenses,
Reports, Settings) works against a seeded, realistic dataset stored in
your browser's `localStorage`. Nothing you do there is lost between page
navigations, so you can add a student, vacate them, collect a payment,
generate this month's payments, and it all behaves like the real system.

To start over with fresh demo data, clear site data or run in the
browser console: `localStorage.removeItem("pms_mock_db_v1")`.

## Connecting Supabase (production)

1. **Create the schema.** In your Supabase project's SQL editor, run
   `sql/schema.sql`. It creates every table, index, constraint, the
   room-occupancy/payment-status/salary-status triggers, and the
   `monthly_income_expense()` function used by the dashboard chart.
2. **Create storage buckets.** Uncomment and run the storage section at
   the bottom of `schema.sql` (creates `photos`, `documents`, `bills`
   buckets) — or create a single bucket named `hostel-documents` and
   update the `BUCKET` constant in `js/storage.js` to match.
3. **Create your admin user.** In Authentication → Users, add the one
   admin account (email + password) this hostel will sign in with.
4. **Add your keys.** Open `js/config.js` and set `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` from Project Settings → API.
5. That's it — every page in `db.js` automatically switches from demo
   mode to live Supabase queries once `isConfigured` is true. No other
   code changes needed.

### RLS note

Since this is a single-admin system, the schema's Row Level Security
policies allow any _authenticated_ user full access to every table. If
you ever add more admin accounts, that's still fine — just don't expose
the anon key to anything other than this app's authenticated session.

## Business rules enforced

- A room can never exceed its capacity (checked both at the database
  level via a `check` constraint, and in `db.js` before creating a student).
- Vacating a student never deletes anything — it flips `status` to
  `vacated`, records the date/reason, and the room-occupancy trigger frees
  the bed automatically.
- Rent is computed automatically from Settings (`student_rent_2/3`,
  `employee_rent_2/3`) plus a bike charge and mess charge, exactly as
  specified.
- Payment status (`paid` / `partial` / `pending`) and worker salary
  `final_salary` are computed automatically — in Postgres via triggers/
  generated columns when connected, and mirrored in `db.js` for demo mode.

## Reports & export

`reports.html` includes all 11 report types from the spec — Student,
Employee, Vacated Student, Room Occupancy, Payment, Pending Fees, Income,
Expense, Salary, Bike Users, and Mess Users — each exportable as CSV,
Excel (via SheetJS), or PDF (via jsPDF + autotable).

## Deployment (Vercel / Netlify)

This is a static site with no build step, so deployment is just "serve
the folder":

**Vercel**

```bash
npm i -g vercel
cd hostel-pms
vercel --prod
```

When prompted for a build command, leave it blank (or set "Other" as the
framework) — there's nothing to build.

**Netlify**

```bash
npm i -g netlify-cli
cd hostel-pms
netlify deploy --prod --dir=.
```

Either way, make sure `js/config.js` has your real Supabase keys checked
in before deploying, or manage it as an environment-injected file in your
CI if you'd rather not commit keys to source control.
