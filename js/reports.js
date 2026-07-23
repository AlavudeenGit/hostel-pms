import { initTheme } from "./theme.js";
import { requireSession } from "./auth.js";
import { renderShell } from "./shell.js";
import {
  listStudents,
  listRooms,
  listPayments,
  listExpenses,
  listSalaries,
  listWorkers,
  getSettings,
} from "./db.js";
import { exportToCSV, exportToExcel, exportToPDF } from "./export.js";
import { formatINR, formatDate, qs, qsa } from "./utils.js";
import { toast } from "./toast.js";

initTheme();
await requireSession();
renderShell("reports");
qs("#report-generated").textContent = "As of " + formatDate(new Date());

function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${path}</svg>`;
}

const REPORTS = [
  {
    key: "students",
    title: "Student Report",
    desc: "All active students with full details.",
    icon: icon(
      `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6"/>`,
    ),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Mobile", value: (r) => r.mobile },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Sharing", value: (r) => r.sharing_type },
      { label: "Mess", value: (r) => (r.mess_available ? "Yes" : "No") },
      { label: "Bike", value: (r) => (r.bike_available ? "Yes" : "No") },
      { label: "Joined", value: (r) => formatDate(r.joining_date) },
      { label: "Aadhar", value: (r) => r.aadhar_number },
    ],
    fetch: async () =>
      (await listStudents({ status: "active" })).filter(
        (s) => s.type === "student",
      ),
  },
  {
    key: "employees",
    title: "Employee Report",
    desc: "Active employees currently staying.",
    icon: icon(
      `<rect x="3" y="7" width="18" height="13" rx="1.8"/><path d="M8 7V5.5A2 2 0 0 1 10 3.5h4A2 2 0 0 1 16 5.5V7"/>`,
    ),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Mobile", value: (r) => r.mobile },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Sharing", value: (r) => r.sharing_type },
      { label: "Joined", value: (r) => formatDate(r.joining_date) },
    ],
    fetch: async () =>
      (await listStudents({ status: "active" })).filter(
        (s) => s.type === "employee",
      ),
  },
  {
    key: "all-inmates",
    title: "All Inmates Report",
    desc: "Every active student and employee combined.",
    icon: icon(
      `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6"/><circle cx="17.5" cy="8.5" r="2.4"/><path d="M15.5 14.6c2.6.4 4.5 2.4 4.5 5.4"/>`,
    ),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Type", value: (r) => r.type },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Mobile", value: (r) => r.mobile },
      { label: "Admission No.", value: (r) => r.admission_number || "" },
      { label: "Category", value: (r) => r.category || "" },
      { label: "Blood Group", value: (r) => r.blood_group || "" },
      { label: "Joined", value: (r) => formatDate(r.joining_date) },
    ],
    fetch: async () => listStudents({ status: "active" }),
  },
  {
    key: "due-report",
    title: "Due Report",
    desc: "Students with pending fees.",
    icon: icon(
      `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6"/><circle cx="17.5" cy="8.5" r="2.4"/><path d="M15.5 14.6c2.6.4 4.5 2.4 4.5 5.4"/>`,
    ),
    columns: [
      { label: "Admission No.", value: (r) => r.admission_number || "" },
      { label: "Name", value: (r) => r.name },
      { label: "Type", value: (r) => r.type },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Bike Number", value: (r) => r.vehicle_number || "" },
      { label: "Rent", value: (r) => formatINR(r.room_rent) },
      {
        label: "Bill No & Date",
        value: (r) => "",
      },
    ],
    fetch: async () => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const [students, payments, settings] = await Promise.all([
        listStudents({ status: "active" }),
        listPayments({ month }),
        getSettings(),
      ]);
      const studentsById = new Map(
        students.map((student) => [student.id, student]),
      );

      return payments
        .filter((payment) => payment.status !== "paid")
        .map((payment) => {
          const student = studentsById.get(payment.student_id);
          if (!student) return null;
          const rentKey = `${student.type}_rent_${student.sharing_type}`;
          return {
            ...student,
            ...payment,
            rooms: student.rooms,
            room_rent:
              Number(payment.room_rent) || Number(settings[rentKey] || 0),
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(a.rooms?.floor || 0) - Number(b.rooms?.floor || 0) ||
            Number(a.rooms?.room_number || 0) -
              Number(b.rooms?.room_number || 0),
        );
    },
  },
  {
    key: "category-tn",
    title: "TN Students",
    desc: "Active inmates in category TN.",
    icon: icon(`<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4"/>`),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Type", value: (r) => r.type },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Mobile", value: (r) => r.mobile },
      { label: "Admission No.", value: (r) => r.admission_number || "" },
      { label: "Joined", value: (r) => formatDate(r.joining_date) },
    ],
    fetch: async () =>
      (await listStudents({ status: "active" })).filter(
        (s) => s.category === "TN",
      ),
  },
  {
    key: "category-kl",
    title: "KL Students",
    desc: "Active inmates in category KL.",
    icon: icon(`<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4"/>`),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Type", value: (r) => r.type },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Mobile", value: (r) => r.mobile },
      { label: "Admission No.", value: (r) => r.admission_number || "" },
      { label: "Joined", value: (r) => formatDate(r.joining_date) },
    ],
    fetch: async () =>
      (await listStudents({ status: "active" })).filter(
        (s) => s.category === "KL",
      ),
  },
  {
    key: "category-nm",
    title: "NM Students",
    desc: "Active inmates in category NM.",
    icon: icon(`<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4"/>`),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Type", value: (r) => r.type },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Mobile", value: (r) => r.mobile },
      { label: "Admission No.", value: (r) => r.admission_number || "" },
      { label: "Joined", value: (r) => formatDate(r.joining_date) },
    ],
    fetch: async () =>
      (await listStudents({ status: "active" })).filter(
        (s) => s.category === "NM",
      ),
  },
  {
    key: "vacated",
    title: "Vacated Student Report",
    desc: "Historical record of vacated residents.",
    icon: icon(`<path d="M6 21V9.5L12 4l8 5.5V21"/><path d="M9 21v-7h6v7"/>`),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Type", value: (r) => r.type },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Joined", value: (r) => formatDate(r.joining_date) },
      { label: "Vacated", value: (r) => formatDate(r.vacated_date) },
      { label: "Reason", value: (r) => r.vacated_reason || "" },
    ],
    fetch: async () => listStudents({ status: "vacated" }),
  },
  {
    key: "rooms",
    title: "Room Occupancy Report",
    desc: "Every room with current occupancy.",
    icon: icon(`<path d="M4 21V9.5L12 4l8 5.5V21"/><path d="M9 21v-7h6v7"/>`),
    columns: [
      { label: "Floor", value: (r) => r.floor },
      { label: "Room", value: (r) => r.room_number },
      { label: "Type", value: (r) => r.room_type + "-Sharing" },
      { label: "Capacity", value: (r) => r.capacity },
      { label: "Occupied", value: (r) => r.occupied_beds },
      { label: "Status", value: (r) => r.status },
    ],
    fetch: async () => listRooms(),
  },
  {
    key: "payments",
    title: "Payment Report",
    desc: "All payments with status, this month.",
    icon: icon(
      `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.5h18"/>`,
    ),
    columns: [
      { label: "Student", value: (r) => r.students?.name || "" },
      { label: "Room", value: (r) => r.students?.rooms?.room_number || "" },
      { label: "Total", value: (r) => r.total_amount },
      { label: "Paid", value: (r) => r.amount_paid },
      { label: "Balance", value: (r) => r.balance },
      { label: "Status", value: (r) => r.status },
      { label: "Method", value: (r) => r.payment_method || "" },
      {
        label: "Date",
        value: (r) => (r.payment_date ? formatDate(r.payment_date) : ""),
      },
    ],
    fetch: async () => listPayments(),
  },
  {
    key: "pending-fees",
    title: "Pending Fees Report",
    desc: "Outstanding balances only.",
    icon: icon(`<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4"/>`),
    columns: [
      { label: "Student", value: (r) => r.students?.name || "" },
      { label: "Room", value: (r) => r.students?.rooms?.room_number || "" },
      { label: "Total", value: (r) => r.total_amount },
      { label: "Paid", value: (r) => r.amount_paid },
      { label: "Balance", value: (r) => r.balance },
    ],
    fetch: async () =>
      (await listPayments()).filter((p) => p.status !== "paid"),
  },
  {
    key: "income",
    title: "Income Report",
    desc: "Monthly collected revenue.",
    icon: icon(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/>`),
    columns: [
      { label: "Student", value: (r) => r.students?.name || "" },
      { label: "Month", value: (r) => formatDate(r.month_year) },
      { label: "Amount Paid", value: (r) => r.amount_paid },
      { label: "Method", value: (r) => r.payment_method || "" },
    ],
    fetch: async () =>
      (await listPayments()).filter((p) => Number(p.amount_paid) > 0),
  },
  {
    key: "expenses",
    title: "Expense Report",
    desc: "All recorded expenses.",
    icon: icon(`<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4"/>`),
    columns: [
      { label: "Date", value: (r) => formatDate(r.expense_date) },
      { label: "Name", value: (r) => r.name },
      { label: "Category", value: (r) => r.category },
      { label: "Paid To", value: (r) => r.paid_to || "" },
      { label: "Amount", value: (r) => r.amount },
    ],
    fetch: async () => listExpenses(),
  },
  {
    key: "salary",
    title: "Salary Report",
    desc: "Worker salaries — paid and pending.",
    icon: icon(
      `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6"/>`,
    ),
    columns: [
      { label: "Worker", value: (r) => r.workers?.name || "" },
      { label: "Position", value: (r) => r.workers?.position || "" },
      { label: "Base", value: (r) => r.base_salary },
      { label: "Final", value: (r) => r.final_salary },
      { label: "Status", value: (r) => r.status },
    ],
    fetch: async () => listSalaries(),
  },
  {
    key: "bike",
    title: "Bike Users Report",
    desc: "Active students/employees with a bike.",
    icon: icon(
      `<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17 12 8l3 0M6 17l4-7h3l3 5"/>`,
    ),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Mobile", value: (r) => r.mobile },
      { label: "Vehicle Number", value: (r) => r.vehicle_number },
    ],
    fetch: async () =>
      (await listStudents({ status: "active" })).filter(
        (s) => s.bike_available,
      ),
  },
  {
    key: "mess",
    title: "Mess Users Report",
    desc: "Active students/employees on mess.",
    icon: icon(
      `<path d="M6 3v18M6 3c-1.5 2-1.5 5 0 7M18 3v18M18 8h-3a2 2 0 0 1 0-4h3v18"/>`,
    ),
    columns: [
      { label: "Name", value: (r) => r.name },
      { label: "Room", value: (r) => r.rooms?.room_number || "" },
      { label: "Mobile", value: (r) => r.mobile },
    ],
    fetch: async () =>
      (await listStudents({ status: "active" })).filter(
        (s) => s.mess_available,
      ),
  },
];

function renderCards() {
  qs("#reports-grid").innerHTML = REPORTS.map(
    (r) => `
    <div class="card card-pad report-card">
      <div class="r-icon">${r.icon}</div>
      <div class="r-title">${r.title}</div>
      <div class="r-desc">${r.desc}</div>
      <div class="r-actions">
        <button class="btn btn-sm btn-ghost export-btn" data-key="${r.key}" data-format="csv">CSV</button>
        <button class="btn btn-sm btn-ghost export-btn" data-key="${r.key}" data-format="excel">Excel</button>
        <button class="btn btn-sm btn-ghost export-btn" data-key="${r.key}" data-format="pdf">PDF</button>
      </div>
    </div>
  `,
  ).join("");

  qsa(".export-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const report = REPORTS.find((r) => r.key === btn.dataset.key);
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "…";
      try {
        const rows = await report.fetch();
        if (!rows.length) {
          toast(`No data yet for ${report.title}.`, "error");
          return;
        }
        const filename =
          report.key + "-" + new Date().toISOString().slice(0, 10);
        if (btn.dataset.format === "csv")
          exportToCSV(rows, report.columns, filename);
        if (btn.dataset.format === "excel")
          exportToExcel(
            rows,
            report.columns,
            filename,
            report.title.slice(0, 28),
          );
        if (btn.dataset.format === "pdf")
          exportToPDF(report.title, rows, report.columns, filename);
        toast(`${report.title} exported.`);
      } catch (err) {
        toast(err.message || "Export failed.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

renderCards();
