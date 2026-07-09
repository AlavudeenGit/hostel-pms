// ============================================================
// CONFIG — your Supabase project details.
// Project Settings → API → Project URL / anon public key.
// The anon key is safe to expose client-side as long as RLS
// policies are enabled on every table (see sql/schema.sql).
// ============================================================
export const SUPABASE_URL = "https://sddhqdqgvqdecvvakdcp.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkZGhxZHFndnFkZWN2dmFrZGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDA4MDQsImV4cCI6MjA5OTA3NjgwNH0.eTVG1VZX7hbrGCmxWA12AMDkaA70AVBr7tc9cBrNl7k";

export const HOSTEL_DEFAULTS = {
  name: "Malabar Muslim Association",
  rent: {
    student_2: 4350,
    student_3: 3850,
    employee_2: 5350,
    employee_3: 4850,
  },
  bikeCharge: 250,
  messDefault: 1800,
};
