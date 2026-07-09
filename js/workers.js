import { initTheme } from "./theme.js";
import { requireSession } from "./auth.js";
import { renderShell } from "./shell.js";
import {
  listWorkers,
  createWorker,
  updateWorker,
  listSalaries,
  upsertSalary,
  monthStartISO,
  todayISO,
} from "./db.js";
import { openModal, closeModal } from "./modal.js";
import { toast } from "./toast.js";
import { formatINR, formatDate, qs, qsa } from "./utils.js";

initTheme();
await requireSession();
renderShell("workers");

const currentMonth = monthStartISO();
qs("#salary-month-label").textContent = new Date().toLocaleDateString("en-IN", {
  month: "long",
  year: "numeric",
});

let workers = [];
let salaries = [];
let statusFilter = "";

async function refresh() {
  [workers, salaries] = await Promise.all([
    listWorkers(),
    listSalaries({ month: currentMonth }),
  ]);
  renderWorkers();
  renderSalaries();
}

function renderWorkers() {
  const rows = workers.filter(
    (w) => !statusFilter || w.status === statusFilter,
  );
  const tbody = qs("#workers-tbody");
  const emptyBox = qs("#workers-empty");
  if (!rows.length) {
    tbody.innerHTML = "";
    emptyBox.innerHTML = `<div class="empty-state"><div class="et-title">No workers yet</div><div>Add your first staff member to get started.</div></div>`;
    return;
  }
  emptyBox.innerHTML = "";
  tbody.innerHTML = rows
    .map(
      (w) => `
    <tr>
      <td class="name-cell">${w.name}</td>
      <td>${w.position}</td>
      <td class="mono">${w.mobile}</td>
      <td class="num">${formatINR(w.salary)}</td>
      <td class="mono">${formatDate(w.joining_date)}</td>
      <td>${w.status === "active" ? `<span class="badge badge-green">Active</span>` : `<span class="badge badge-grey">Inactive</span>`}</td>
      <td>
        <select class="tb-filter-sm worker-status-select" data-worker="${w.id}">
          <option value="active" ${w.status === "active" ? "selected" : ""}>Active</option>
          <option value="inactive" ${w.status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      </td>
    </tr>
  `,
    )
    .join("");

  qsa(".worker-status-select", tbody).forEach((sel) => {
    sel.addEventListener("change", async () => {
      await updateWorker(sel.dataset.worker, { status: sel.value });
      toast("Worker status updated.");
      refresh();
    });
  });
}

function renderSalaries() {
  const tbody = qs("#salaries-tbody");
  const activeWorkers = workers.filter((w) => w.status === "active");
  tbody.innerHTML = activeWorkers
    .map((w) => {
      const rec = salaries.find((s) => s.worker_id === w.id) || {
        worker_id: w.id,
        month_year: currentMonth,
        base_salary: w.salary,
        advance: 0,
        overtime: 0,
        bonus: 0,
        leave_taken: 0,
        leave_deduction: 0,
        final_salary: w.salary,
        status: "pending",
      };
      return `
      <tr>
        <td class="name-cell">${w.name}<div style="font-size:11px; color:var(--ink-faint); font-weight:400;">${w.position}</div></td>
        <td class="num">${formatINR(rec.base_salary)}</td>
        <td class="num">${formatINR(rec.overtime)}</td>
        <td class="num">${formatINR(rec.bonus)}</td>
        <td class="num">${formatINR(rec.advance)}</td>
        <td class="num">${formatINR(rec.leave_deduction)}</td>
        <td class="num" style="font-weight:600;">${formatINR(rec.final_salary)}</td>
        <td>${rec.status === "paid" ? `<span class="badge badge-green">Paid</span>` : `<span class="badge badge-red">Pending</span>`}</td>
        <td><button class="btn btn-sm btn-ghost salary-edit-btn" data-worker="${w.id}">${rec.status === "paid" ? "View" : "Pay"}</button></td>
      </tr>`;
    })
    .join("");

  qsa(".salary-edit-btn", tbody).forEach((btn) => {
    btn.addEventListener("click", () => openSalaryModal(btn.dataset.worker));
  });
}

function openSalaryModal(workerId) {
  const w = workers.find((x) => x.id === workerId);
  const rec = salaries.find((s) => s.worker_id === workerId) || {
    base_salary: w.salary,
    advance: 0,
    overtime: 0,
    bonus: 0,
    leave_taken: 0,
  };

  const el = openModal({
    title: `Salary — ${w.name}`,
    sub: qs("#salary-month-label").textContent,
    bodyHTML: `
      <div class="form-grid">
        <div class="f-field"><label>Base Salary</label><input type="number" id="sal-base" value="${rec.base_salary}" /></div>
        <div class="f-field"><label>Overtime</label><input type="number" id="sal-overtime" value="${rec.overtime || 0}" /></div>
        <div class="f-field"><label>Bonus</label><input type="number" id="sal-bonus" value="${rec.bonus || 0}" /></div>
        <div class="f-field"><label>Advance Paid</label><input type="number" id="sal-advance" value="${rec.advance || 0}" /></div>
        <div class="f-field"><label>Leave Taken (days)</label><input type="number" id="sal-leave" value="${rec.leave_taken || 0}" /></div>
        <div class="f-field"><label>Final Salary</label><input type="text" id="sal-final" value="${formatINR(rec.final_salary || rec.base_salary)}" disabled /></div>
        <div class="f-field"><label>Payment Method</label>
          <select id="sal-method"><option value="Cash">Cash</option><option value="GPay">GPay</option><option value="Bank">Bank</option></select></div>
        <div class="f-field"><label>Payment Date</label><input type="date" id="sal-date" value="${todayISO()}" /></div>
      </div>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="sal-save">Mark Paid</button>`,
  });

  function recalc() {
    const base = Number(qs("#sal-base", el).value || 0);
    const overtime = Number(qs("#sal-overtime", el).value || 0);
    const bonus = Number(qs("#sal-bonus", el).value || 0);
    const advance = Number(qs("#sal-advance", el).value || 0);
    const leave = Number(qs("#sal-leave", el).value || 0);
    const perDay = Math.round(base / 30);
    const leaveDeduction = leave * perDay;
    const final = base + overtime + bonus - advance - leaveDeduction;
    qs("#sal-final", el).value = formatINR(final);
    return { base, overtime, bonus, advance, leave, leaveDeduction, final };
  }
  ["sal-base", "sal-overtime", "sal-bonus", "sal-advance", "sal-leave"].forEach(
    (id) => {
      qs(`#${id}`, el).addEventListener("input", recalc);
    },
  );
  recalc();

  el.querySelector("#sal-save").addEventListener("click", async () => {
    const vals = recalc();
    await upsertSalary({
      worker_id: workerId,
      month_year: currentMonth,
      base_salary: vals.base,
      overtime: vals.overtime,
      bonus: vals.bonus,
      advance: vals.advance,
      leave_taken: vals.leave,
      leave_deduction: vals.leaveDeduction,
      status: "paid",
      payment_method: qs("#sal-method", el).value,
      payment_date: qs("#sal-date", el).value,
    });
    toast(`Salary recorded for ${w.name}.`);
    closeModal();
    refresh();
  });
}

function openAddWorkerModal() {
  const el = openModal({
    title: "Add worker",
    bodyHTML: `
      <div class="form-grid">
        <div class="f-field span-2"><label>Name <span class="req">*</span></label><input type="text" id="w-name" required /></div>
        <div class="f-field"><label>Mobile <span class="req">*</span></label><input type="tel" id="w-mobile" required /></div>
        <div class="f-field"><label>Alternative Mobile</label><input type="tel" id="w-alt-mobile" /></div>
        <div class="f-field"><label>Position <span class="req">*</span></label>
          <select id="w-position"><option>Cleaner</option><option>Watchman</option><option>Cook</option><option>Other</option></select></div>
        <div class="f-field"><label>Monthly Salary <span class="req">*</span></label><input type="number" id="w-salary" required /></div>
        <div class="f-field"><label>Aadhar Number</label><input type="text" id="w-aadhar" /></div>
        <div class="f-field"><label>Joining Date <span class="req">*</span></label><input type="date" id="w-joining" value="${todayISO()}" required /></div>
        <div class="f-field span-2"><label>Permanent Address</label><textarea id="w-perm-addr"></textarea></div>
        <div class="f-field span-2"><label>Current Address</label><textarea id="w-cur-addr"></textarea></div>
      </div>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="w-save">Add worker</button>`,
  });
  el.querySelector("#w-save").addEventListener("click", async () => {
    if (
      !qs("#w-name", el).value.trim() ||
      !qs("#w-mobile", el).value.trim() ||
      !qs("#w-salary", el).value
    ) {
      toast("Name, mobile and salary are required.", "error");
      return;
    }
    await createWorker({
      name: qs("#w-name", el).value.trim(),
      mobile: qs("#w-mobile", el).value.trim(),
      alt_mobile: qs("#w-alt-mobile", el).value.trim(),
      position: qs("#w-position", el).value,
      salary: Number(qs("#w-salary", el).value),
      aadhar_number: qs("#w-aadhar", el).value.trim(),
      permanent_address: qs("#w-perm-addr", el).value.trim(),
      current_address: qs("#w-cur-addr", el).value.trim(),
      joining_date: qs("#w-joining", el).value,
    });
    toast("Worker added.");
    closeModal();
    refresh();
  });
}

qs("#add-worker-btn").addEventListener("click", openAddWorkerModal);
qs("#filter-worker-status").addEventListener("change", (e) => {
  statusFilter = e.target.value;
  renderWorkers();
});

refresh();
