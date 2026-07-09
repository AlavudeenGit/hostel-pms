import { initTheme } from "./theme.js";
import { requireSession } from "./auth.js";
import { renderShell } from "./shell.js";
import { listExpenses, createExpense, todayISO } from "./db.js";
import { uploadFile } from "./storage.js";
import { openModal, closeModal } from "./modal.js";
import { toast } from "./toast.js";
import { formatINR, formatDate, qs, qsa } from "./utils.js";

initTheme();
await requireSession();
renderShell("expenses", { searchPlaceholder: "Search expenses…" });

const CATEGORIES = [
  "Electricity",
  "Water",
  "Internet",
  "Cleaning",
  "Gas",
  "Furniture",
  "Repair",
  "Painting",
  "Building Maintenance",
  "Staff Salary",
  "Food",
  "Miscellaneous",
];
qs("#filter-category").innerHTML += CATEGORIES.map(
  (c) => `<option value="${c}">${c}</option>`,
).join("");

let expenses = [];
let filters = { search: "", category: "" };
let chart;

async function refresh() {
  expenses = await listExpenses();
  renderStats();
  renderTable();
  renderChart();
}

function renderStats() {
  const today = todayISO();
  const monthPrefix = today.slice(0, 7);
  const yearPrefix = today.slice(0, 4);
  const todayTotal = expenses
    .filter((e) => e.expense_date === today)
    .reduce((s, e) => s + Number(e.amount), 0);
  const monthTotal = expenses
    .filter((e) => e.expense_date.startsWith(monthPrefix))
    .reduce((s, e) => s + Number(e.amount), 0);
  const yearTotal = expenses
    .filter((e) => e.expense_date.startsWith(yearPrefix))
    .reduce((s, e) => s + Number(e.amount), 0);
  const cards = [
    { tag: "Today", value: formatINR(todayTotal) },
    { tag: "This Month", value: formatINR(monthTotal) },
    { tag: "This Year", value: formatINR(yearTotal) },
    { tag: "All-time Records", value: expenses.length },
  ];
  qs("#expense-stats").innerHTML = cards
    .map(
      (c) =>
        `<div class="stat-card"><div class="tag">${c.tag}</div><div class="value num">${c.value}</div></div>`,
    )
    .join("");
}

function renderTable() {
  const q = filters.search.trim().toLowerCase();
  const rows = expenses.filter((e) => {
    if (filters.category && e.category !== filters.category) return false;
    if (q && !`${e.name} ${e.paid_to}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const tbody = qs("#expenses-tbody");
  const emptyBox = qs("#expenses-empty");
  if (!rows.length) {
    tbody.innerHTML = "";
    emptyBox.innerHTML = `<div class="empty-state"><div class="et-title">No expenses match these filters</div></div>`;
    return;
  }
  emptyBox.innerHTML = "";
  tbody.innerHTML = rows
    .map(
      (e) => `
    <tr>
      <td class="mono">${formatDate(e.expense_date)}</td>
      <td class="name-cell">${e.name}</td>
      <td><span class="badge badge-blue">${e.category}</span></td>
      <td>${e.paid_to || "—"}</td>
      <td class="num">${formatINR(e.amount)}</td>
      <td style="text-transform:capitalize;">${e.payment_method || "—"}</td>
    </tr>
  `,
    )
    .join("");
}

function renderChart() {
  const byCat = {};
  expenses.forEach((e) => {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
  });
  const labels = Object.keys(byCat);
  const data = Object.values(byCat);
  const palette = [
    "#2A4E7A",
    "#2F6B54",
    "#B8912A",
    "#A83A2E",
    "#6B7594",
    "#A6791E",
    "#4C5878",
    "#7FA8DA",
    "#6FCBA6",
    "#E3C877",
    "#E27A6B",
    "#16213E",
  ];
  if (chart) chart.destroy();
  chart = new Chart(qs("#chart-category"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: palette, borderWidth: 0 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, font: { size: 10.5 } },
        },
      },
    },
  });
}

function openAddExpenseModal() {
  const el = openModal({
    title: "Add expense",
    bodyHTML: `
      <div class="form-grid">
        <div class="f-field span-2"><label>Expense Name <span class="req">*</span></label><input type="text" id="e-name" required /></div>
        <div class="f-field"><label>Category <span class="req">*</span></label>
          <select id="e-category">${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}</select></div>
        <div class="f-field"><label>Amount <span class="req">*</span></label><input type="number" id="e-amount" required /></div>
        <div class="f-field"><label>Expense Date</label><input type="date" id="e-date" value="${todayISO()}" /></div>
        <div class="f-field"><label>Paid To</label><input type="text" id="e-paidto" /></div>
        <div class="f-field"><label>Payment Method</label>
          <select id="e-method"><option value="cash">Cash</option><option value="gpay">GPay</option><option value="phonepe">PhonePe</option><option value="bank_transfer">Bank Transfer</option><option value="upi">UPI</option></select></div>
        <div class="f-field"><label>Bill Upload</label>
          <div class="f-upload"><input type="file" id="e-bill" accept="image/*,application/pdf" /><div>Upload bill/receipt</div><div class="fname" id="e-bill-name"></div></div></div>
        <div class="f-field span-2"><label>Remarks</label><textarea id="e-remarks"></textarea></div>
      </div>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="e-save">Add expense</button>`,
  });

  qs("#e-bill", el).addEventListener("change", () => {
    qs("#e-bill-name", el).textContent = qs("#e-bill", el).files[0]?.name || "";
  });

  el.querySelector("#e-save").addEventListener("click", async () => {
    if (!qs("#e-name", el).value.trim() || !qs("#e-amount", el).value) {
      toast("Expense name and amount are required.", "error");
      return;
    }
    const bill_url = await uploadFile(qs("#e-bill", el).files[0], "bills");
    await createExpense({
      name: qs("#e-name", el).value.trim(),
      category: qs("#e-category", el).value,
      amount: Number(qs("#e-amount", el).value),
      expense_date: qs("#e-date", el).value,
      paid_to: qs("#e-paidto", el).value.trim(),
      payment_method: qs("#e-method", el).value,
      bill_url,
      remarks: qs("#e-remarks", el).value.trim(),
    });
    toast("Expense recorded.");
    closeModal();
    refresh();
  });
}

qs("#add-expense-btn").addEventListener("click", openAddExpenseModal);
qs("#e-search").addEventListener("input", (e) => {
  filters.search = e.target.value;
  renderTable();
});
qs("#filter-category").addEventListener("change", (e) => {
  filters.category = e.target.value;
  renderTable();
});

refresh();
