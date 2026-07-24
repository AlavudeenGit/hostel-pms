import { initTheme } from "./theme.js";
import { requireSession } from "./auth.js";
import { renderShell } from "./shell.js";
import {
  listPayments,
  collectPayment,
  generateMonthlyPayments,
  getSettings,
  todayISO,
} from "./db.js";
import { openModal, closeModal } from "./modal.js";
import { toast } from "./toast.js";
import { formatINR, formatDate, qs, qsa } from "./utils.js";

initTheme();
await requireSession();
renderShell("payments", { searchPlaceholder: "Search student, room, mobile…" });

let payments = [];
let activeTab = "all";
let search = "";

async function refresh() {
  payments = await listPayments();
  renderStats();
  renderTable();
}

function renderStats() {
  const total = payments.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const collected = payments.reduce(
    (s, p) => s + Number(p.amount_paid || 0),
    0,
  );
  const pending = payments.filter((p) => p.status !== "paid").length;
  const balance = payments.reduce((s, p) => s + Number(p.balance || 0), 0);
  const cards = [
    { tag: "Total Billed (this month)", value: formatINR(total) },
    { tag: "Collected", value: formatINR(collected) },
    { tag: "Outstanding Balance", value: formatINR(balance) },
    { tag: "Pending / Partial Records", value: pending },
  ];
  qs("#payment-stats").innerHTML = cards
    .map(
      (c) =>
        `<div class="stat-card"><div class="tag">${c.tag}</div><div class="value num">${c.value}</div></div>`,
    )
    .join("");
}

function renderTable() {
  const q = search.trim().toLowerCase();
  let rows = payments;
  if (activeTab === "pending") rows = rows.filter((p) => p.status !== "paid");
  if (q) {
    rows = rows.filter((p) => {
      const name = p.students?.name || "";
      const room = p.students?.rooms?.room_number || "";
      return `${name} ${room}`.toLowerCase().includes(q);
    });
  }

  const tbody = qs("#payments-tbody");
  const emptyBox = qs("#payments-empty");
  if (!rows.length) {
    tbody.innerHTML = "";
    emptyBox.innerHTML = `<div class="empty-state"><div class="et-title">No payment records</div><div>Try "Generate this month's payments" above.</div></div>`;
    return;
  }
  emptyBox.innerHTML = "";

  const statusBadge = {
    paid: "badge-green",
    partial: "badge-amber",
    pending: "badge-red",
  };
  // <td class="num">${formatINR(p.bike_charge)}</td>
  tbody.innerHTML = rows
    .map(
      (p,index) => `
    <tr data-row-id="${p.id}">
      <td class="mono">${index + 1}</td>
      <td class="name-cell">${p.students?.name || "—"}</td>
      <td class="mono">${p.students?.rooms?.room_number || "—"}</td>
      <td class="num">${formatINR(p.room_rent)}</td>
      
      <td>
        <input type="number" class="mess-inline-input" data-id="${p.id}" min="0" value="${Number(p.mess_charge || 0)}" />
      </td>
      <td class="num row-total" style="font-weight:600;">${formatINR(p.total_amount)}</td>
      <td class="num">${formatINR(p.amount_paid)}</td>
      <td class="num row-balance" style="color:${p.balance > 0 ? "var(--ledger-red)" : "var(--ledger-green)"}">${formatINR(p.balance)}</td>
      <td class="row-status"><span class="badge ${statusBadge[p.status]}">${p.status}</span></td>
      <td><button class="btn btn-sm btn-ghost collect-btn" data-id="${p.id}">${p.status === "paid" ? "Receipt" : "Collect"}</button></td>
    </tr>
  `,
    )
    .join("");

  qsa(".collect-btn", tbody).forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = payments.find((x) => x.id === btn.dataset.id);
      p.status === "paid" ? openReceipt(p) : openCollectModal(p);
    });
  });

  qsa(".mess-inline-input", tbody).forEach((input) => {
    input.addEventListener("change", () => updateMessInline(input));
  });
}

async function updateMessInline(input) {
  const id = input.dataset.id;
  const p = payments.find((x) => x.id === id);
  if (!p) return;
  const mess_charge = Number(input.value || 0);
  if (mess_charge === Number(p.mess_charge || 0)) return;

  const row = input.closest("tr");
  input.disabled = true;
  try {
    const updated = await collectPayment(id, { mess_charge });
    // Merge the recalculated fields back into our local copy so the
    // Collect Payment modal and Receipt immediately reflect the new total.
    Object.assign(p, updated || {}, { mess_charge });
    if (!updated) {
      // demo/mock path already returns the merged+recomputed record; if a
      // configured backend returns nothing unexpected, recompute locally.
      p.total_amount =
        Number(p.room_rent) + Number(p.bike_charge) + mess_charge;
      p.balance = p.total_amount - Number(p.amount_paid);
      p.status =
        p.amount_paid <= 0
          ? "pending"
          : p.amount_paid >= p.total_amount
            ? "paid"
            : "partial";
    }
    if (row) {
      row.querySelector(".row-total").textContent = formatINR(p.total_amount);
      const balCell = row.querySelector(".row-balance");
      balCell.textContent = formatINR(p.balance);
      balCell.style.color =
        p.balance > 0 ? "var(--ledger-red)" : "var(--ledger-green)";
      const statusBadge = {
        paid: "badge-green",
        partial: "badge-amber",
        pending: "badge-red",
      };
      row.querySelector(".row-status").innerHTML =
        `<span class="badge ${statusBadge[p.status]}">${p.status}</span>`;
    }
    renderStats();
    toast(`Mess charge updated for ${p.students?.name || "this student"}.`);
  } catch (err) {
    toast(err.message || "Could not update mess charge.", "error");
    input.value = p.mess_charge;
  } finally {
    input.disabled = false;
  }
}

function openCollectModal(p) {
  const el = openModal({
    title: `Collect payment — ${p.students?.name || ""}`,
    sub: `Room ${p.students?.rooms?.room_number || "—"} · ${formatDate(p.month_year)}`,
    // <div class="f-field"><label>Bike Charge</label><input type="number" id="c-bike" value="${p.bike_charge || 0}" /></div>

    bodyHTML: `
      <div class="form-grid">
        <div class="f-field"><label>Room Rent</label><input type="number" id="c-rent" value="${p.room_rent || 0}" /></div>
        <div class="f-field"><label>Mess Charge</label><input type="number" id="c-mess" value="${p.mess_charge || 0}" />
          <div class="hint">Specific to this student — changing it won't affect anyone else's record.</div></div>
        <div class="f-field"><label>Total</label><input type="text" id="c-total" value="${formatINR(p.total_amount)}" disabled /></div>
        <div class="f-field"><label>Amount Paid <span class="req">*</span></label><input type="number" id="c-amount" value="${p.amount_paid || 0}" /></div>
        <div class="f-field"><label>Payment Method</label>
          <select id="c-method"><option value="Cash">Cash</option><option value="Pay">GPay</option><option value="PhonePe">PhonePe</option><option value="Bank Transfer">Bank Transfer</option><option value="UPI">UPI</option></select></div>
        <div class="f-field"><label>Transaction Number</label><input type="text" id="c-txn" value="${p.transaction_number || ""}" /></div>
        <div class="f-field"><label>Payment Date</label><input type="date" id="c-date" value="${p.payment_date || todayISO()}" /></div>
        <div class="f-field span-2"><label>Remarks</label><textarea id="c-remarks">${p.remarks || ""}</textarea></div>
      </div>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="c-save">Save payment</button>`,
  });

  function recalcTotal() {
    const rent = Number(qs("#c-rent", el).value || 0);
    const bike = Number(qs("#c-bike", el).value || 0);
    const mess = Number(qs("#c-mess", el).value || 0);
    qs("#c-total", el).value = formatINR(rent + bike + mess);
  }
  ["#c-rent", "#c-bike", "#c-mess"].forEach((sel) =>
    qs(sel, el).addEventListener("input", recalcTotal),
  );

  el.querySelector("#c-save").addEventListener("click", async () => {
    const room_rent = Number(qs("#c-rent", el).value || 0);
    const bike_charge = Number(qs("#c-bike", el).value || 0);
    const mess_charge = Number(qs("#c-mess", el).value || 0);
    const amount_paid = Number(qs("#c-amount", el).value || 0);
    await collectPayment(p.id, {
      room_rent,
      bike_charge,
      mess_charge,
      amount_paid,
      payment_method: qs("#c-method", el).value,
      transaction_number: qs("#c-txn", el).value.trim(),
      payment_date: qs("#c-date", el).value,
      remarks: qs("#c-remarks", el).value.trim(),
    });
    toast(`Payment recorded for ${p.students?.name || "student"}.`);
    closeModal();
    refresh();
  });
}

async function openReceipt(p) {
  const settings = await getSettings();
  const el = openModal({
    title: "Receipt",
    bodyHTML: `
      <div style="border:1px solid var(--line); border-radius:var(--radius-m); padding:var(--space-5);">
        <div style="text-align:center; margin-bottom:var(--space-4);">
          <div style="font-family:var(--font-display); font-weight:600; font-size:18px;">${settings.hostel_name || "Hostel"}</div>
          <div style="font-size:11.5px; color:var(--ink-faint);">${settings.address || ""}</div>
        </div>
        <div class="so-kv" style="margin-bottom:var(--space-4);">
          <div><div class="k">Student</div><div class="v">${p.students?.name || "—"}</div></div>
          <div><div class="k">Room</div><div class="v mono">${p.students?.rooms?.room_number || "—"}</div></div>
          <div><div class="k">Month</div><div class="v">${formatDate(p.month_year)}</div></div>
          <div><div class="k">Payment Date</div><div class="v">${formatDate(p.payment_date)}</div></div>
          <div><div class="k">Method</div><div class="v" style="text-transform:capitalize;">${p.payment_method || "—"}</div></div>
          <div><div class="k">Transaction No.</div><div class="v mono">${p.transaction_number || "—"}</div></div>
        </div>
        <table class="reg-table"><tbody>
          <tr><td>Room Rent</td><td class="num">${formatINR(p.room_rent)}</td></tr>
          <tr><td>Bike Charge</td><td class="num">${formatINR(p.bike_charge)}</td></tr>
          <tr><td>Mess Charge</td><td class="num">${formatINR(p.mess_charge)}</td></tr>
          <tr><td style="font-weight:600;">Total</td><td class="num" style="font-weight:600;">${formatINR(p.total_amount)}</td></tr>
          <tr><td style="color:var(--ledger-green);">Paid</td><td class="num" style="color:var(--ledger-green);">${formatINR(p.amount_paid)}</td></tr>
        </tbody></table>
      </div>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Close</button><button class="btn btn-primary" id="print-receipt">Print / Save PDF</button>`,
  });
  el.querySelector("#print-receipt").addEventListener("click", () =>
    window.print(),
  );
}

qs("#generate-btn").addEventListener("click", async () => {
  const btn = qs("#generate-btn");
  btn.disabled = true;
  btn.textContent = "Generating…";
  const count = await generateMonthlyPayments();
  toast(
    count
      ? `Generated ${count} payment record(s) for this month.`
      : "All active students already have a record for this month.",
  );
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Generate this month's payments`;
  refresh();
});

qs("#p-search").addEventListener("input", (e) => {
  search = e.target.value;
  renderTable();
});
qsa(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    qsa(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    renderTable();
  });
});

refresh();
