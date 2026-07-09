import { supabase, isConfigured } from "./supabaseClient.js";
import {
  listRooms,
  listStudents,
  listPayments,
  listExpenses,
  listSalaries,
  monthStartISO,
} from "./db.js";
import { formatINR, formatDate, timeAgo, qs, qsa } from "./utils.js";
import { toast } from "./toast.js";

const mockIncomeExpense = {
  labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  income: [142000, 151000, 149500, 160200, 155800, 168400],
  expense: [48000, 51200, 46800, 53100, 49700, 52300],
};

function buildActivity(students, payments, expenses, salaries) {
  const items = [];

  students.forEach((s) => {
    if (s.created_at) {
      items.push({
        type: "student",
        text: `<b>${s.name}</b> added to Room ${s.rooms?.room_number || "—"}`,
        time: new Date(s.created_at),
      });
    }
    if (s.status === "vacated" && s.vacated_date) {
      items.push({
        type: "vacate",
        text: `<b>${s.name}</b> vacated their room`,
        time: new Date(s.vacated_date),
      });
    }
  });

  payments.forEach((p) => {
    if (Number(p.amount_paid) > 0 && p.payment_date) {
      items.push({
        type: "payment",
        text: `<b>${p.students?.name || "A student"}</b> paid ${formatINR(p.amount_paid)}`,
        time: new Date(p.payment_date),
      });
    }
  });

  expenses.forEach((e) => {
    if (e.created_at) {
      items.push({
        type: "expense",
        text: `${e.name} recorded — ${formatINR(e.amount)}`,
        time: new Date(e.created_at),
      });
    }
  });

  salaries.forEach((r) => {
    if (r.status === "paid" && r.payment_date) {
      items.push({
        type: "salary",
        text: `Salary paid to <b>${r.workers?.name || "a staff member"}</b>`,
        time: new Date(r.payment_date),
      });
    }
  });

  return items
    .filter((i) => i.time instanceof Date && !isNaN(i.time.getTime()))
    .sort((a, b) => b.time - a.time)
    .slice(0, 6);
}

async function loadIncomeExpense() {
  if (isConfigured) {
    try {
      const { data, error } = await supabase.rpc("monthly_income_expense");
      if (error) throw error;
      if (data && data.length) {
        return {
          labels: data.map((d) => d.labels),
          income: data.map((d) => Number(d.income)),
          expense: data.map((d) => Number(d.expense)),
        };
      }
    } catch (err) {
      console.warn(
        "monthly_income_expense RPC unavailable, using demo series:",
        err.message,
      );
    }
  }
  return mockIncomeExpense;
}

function renderStats(s) {
  const cards = [
    {
      tag: "Occupied / Total Beds",
      value: `${s.occupiedBeds}/${s.totalBeds}`,
      delta: `${s.availableBeds} beds free`,
      cls: "up",
      icon: bedIcon(),
      color: "var(--ledger-blue-bg)",
      iconColor: "var(--ledger-blue)",
    },
    {
      tag: "Active Students",
      value: s.activeStudents,
      delta: `${s.employeesStaying} employees staying`,
      cls: "up",
      icon: personIcon(),
      color: "var(--ledger-green-bg)",
      iconColor: "var(--ledger-green)",
    },
    {
      tag: "Monthly Income",
      value: formatINR(s.monthlyIncome),
      delta: "Collected this month",
      cls: "up",
      icon: coinIcon(),
      color: "var(--brass-soft)",
      iconColor: "var(--brass-ink)",
    },
    {
      tag: "Monthly Expenses",
      value: formatINR(s.monthlyExpenses),
      delta: "Spent this month",
      cls: "down",
      icon: alertIcon(),
      color: "var(--ledger-red-bg)",
      iconColor: "var(--ledger-red)",
    },
    {
      tag: "Pending Payments",
      value: s.pendingPayments,
      delta: formatINR(s.salaryPending) + " salary due",
      cls: "down",
      icon: alertIcon(),
      color: "var(--ledger-amber-bg)",
      iconColor: "var(--ledger-amber)",
    },
  ];
  const wrap = qs("#stat-cards");
  wrap.innerHTML = cards
    .map(
      (c) => `
    <div class="stat-card">
      <div class="stamp" style="background:${c.color}; color:${c.iconColor}">${c.icon}</div>
      <div class="tag">${c.tag}</div>
      <div class="value num">${c.value}</div>
      <div class="delta ${c.cls}">${c.delta}</div>
    </div>
  `,
    )
    .join("");
}

function renderKeyRack(rooms) {
  const byFloor = rooms.reduce((acc, r) => {
    (acc[r.floor] = acc[r.floor] || []).push(r);
    return acc;
  }, {});
  const wrap = qs("#key-rack");
  let html = `<div class="rack-rail"></div>`;
  Object.keys(byFloor)
    .sort()
    .forEach((floor) => {
      html += `<div class="rack-floor-label">Floor ${floor}</div><div class="rack-row">`;
      byFloor[floor].forEach((r) => {
        html += `
        <button class="key-tag status-${r.status}" data-room="${r.room_number}" data-occ="${r.occupied_beds}" data-cap="${r.capacity}" data-type="${r.room_type}" data-status="${r.status}">
          <span class="hook"></span>
          <span class="tag-body">
            <span class="room-no">${r.room_number}</span>
            <span class="occ">${r.status === "maintenance" ? "—" : r.occupied_beds + "/" + r.capacity}</span>
          </span>
        </button>`;
      });
      html += `</div>`;
    });
  wrap.innerHTML = html;
  wireKeyTagTooltip(wrap);
}

function wireKeyTagTooltip(wrap) {
  const tip = qs("#key-tooltip");
  qsa(".key-tag", wrap).forEach((tag) => {
    tag.addEventListener("mouseenter", () => {
      const { room, occ, cap, type, status } = tag.dataset;
      const statusLabel = {
        available: "Available",
        full: "Full",
        maintenance: "Maintenance",
      }[status];
      tip.innerHTML = `
        <div class="kt-title">Room ${room}</div>
        <div class="kt-row"><span>Type</span><span>${type}-Sharing</span></div>
        <div class="kt-row"><span>Occupancy</span><span>${status === "maintenance" ? "—" : occ + " / " + cap}</span></div>
        <div class="kt-row"><span>Status</span><span>${statusLabel}</span></div>
      `;
      const r = tag.getBoundingClientRect();
      const parentRect = wrap.getBoundingClientRect();
      tip.style.left = r.left - parentRect.left + "px";
      tip.style.top = r.top - parentRect.top - 92 + "px";
      tip.classList.add("show");
    });
    tag.addEventListener("mouseleave", () => tip.classList.remove("show"));
    tag.addEventListener("click", () => {
      window.location.href = "rooms.html";
    });
  });
}

function renderCharts(rooms, ie, studentTypeCounts) {
  new Chart(qs("#chart-income-expense"), {
    type: "bar",
    data: {
      labels: ie.labels,
      datasets: [
        {
          label: "Income",
          data: ie.income,
          backgroundColor: "#2F6B54",
          borderRadius: 4,
          maxBarThickness: 22,
        },
        {
          label: "Expense",
          data: ie.expense,
          backgroundColor: "#A83A2E",
          borderRadius: 4,
          maxBarThickness: 22,
        },
      ],
    },
    options: chartBaseOptions(),
  });

  const totalBeds = rooms.reduce((s, r) => s + r.capacity, 0);
  const occupied = rooms.reduce((s, r) => s + r.occupied_beds, 0);
  new Chart(qs("#chart-occupancy"), {
    type: "doughnut",
    data: {
      labels: ["Occupied", "Available"],
      datasets: [
        {
          data: [occupied, totalBeds - occupied],
          backgroundColor: ["#2A4E7A", "#E3E7EF"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      cutout: "72%",
      plugins: { legend: { display: false } },
      maintainAspectRatio: false,
    },
  });

  new Chart(qs("#chart-student-employee"), {
    type: "pie",
    data: {
      labels: ["Students", "Employees"],
      datasets: [
        {
          data: [studentTypeCounts.student, studentTypeCounts.employee],
          backgroundColor: ["#B8912A", "#2F6B54"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, font: { size: 11 } },
        },
      },
      maintainAspectRatio: false,
    },
  });
}

function chartBaseOptions() {
  const gridColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--line")
      .trim() || "#e5e5e5";
  const textColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--ink-faint")
      .trim() || "#888";
  return {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 10, font: { size: 11 }, color: textColor },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: textColor, font: { size: 11 } },
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { size: 11 } },
      },
    },
  };
}

const activityIcons = {
  payment: {
    icon: coinIcon(),
    bg: "var(--ledger-green-bg)",
    fg: "var(--ledger-green)",
  },
  vacate: {
    icon: doorIcon(),
    bg: "var(--ledger-red-bg)",
    fg: "var(--ledger-red)",
  },
  student: {
    icon: personIcon(),
    bg: "var(--ledger-blue-bg)",
    fg: "var(--ledger-blue)",
  },
  expense: {
    icon: alertIcon(),
    bg: "var(--ledger-amber-bg)",
    fg: "var(--ledger-amber)",
  },
  salary: { icon: bedIcon(), bg: "var(--brass-soft)", fg: "var(--brass-ink)" },
};

function renderActivity(items) {
  const wrap = qs("#activity-list");
  if (!items.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding: var(--space-5) var(--space-4);">
      <div class="et-title">No activity yet</div>
      <div>Add a student, collect a payment, or log an expense to see it here.</div>
    </div>`;
    return;
  }
  wrap.innerHTML = items
    .map((a) => {
      const meta = activityIcons[a.type] || activityIcons.student;
      return `
      <div class="activity-row">
        <div class="activity-icon" style="background:${meta.bg}; color:${meta.fg}">${meta.icon}</div>
        <div class="activity-text">${a.text}</div>
        <div class="activity-time">${timeAgo(a.time)}</div>
      </div>`;
    })
    .join("");
}

function renderPendingPreview(payments) {
  const rows = payments.filter((p) => p.status !== "paid").slice(0, 5);
  const tbody = qs("#pending-preview-table tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--ink-faint); padding:24px 0;">Nothing pending — fully collected this month.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (p) => `
    <tr>
      <td class="name-cell">${p.students?.name || "—"}</td>
      <td class="mono">${p.students?.rooms?.room_number || "—"}</td>
      <td class="num">${formatINR(p.balance)}</td>
      <td><span class="badge ${p.status === "partial" ? "badge-amber" : "badge-red"}">${p.status === "partial" ? "Partial" : "Pending"}</span></td>
    </tr>
  `,
    )
    .join("");
}

function bedIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 18v2M21 18v2M3 13h18"/></svg>`;
}
function personIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>`;
}
function coinIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.3 15c0 1.1 1.2 2 2.7 2s2.7-.8 2.7-2c0-2.6-5.4-1.2-5.4-3.8 0-1.1 1.2-2 2.7-2s2.7.9 2.7 2"/></svg>`;
}
function alertIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4M12 16.5v.01"/></svg>`;
}
function doorIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h6L18 6v15"/><path d="M6 21h12M15 13v.01"/></svg>`;
}

export async function initDashboard() {
  qs("#today-date").textContent = formatDate(new Date());

  const [rooms, allStudents, ie] = await Promise.all([
    listRooms(),
    listStudents(),
    loadIncomeExpense(),
  ]);
  const activeStudents = allStudents.filter((s) => s.status === "active");
  const studentTypeCounts = {
    student: activeStudents.filter((s) => s.type === "student").length,
    employee: activeStudents.filter((s) => s.type === "employee").length,
  };

  const month = monthStartISO();
  const [payments, expenses, salaries] = await Promise.all([
    listPayments({ month }),
    listExpenses(),
    listSalaries({ month }),
  ]);

  const now = new Date();
  const monthlyExpenseTotal = expenses
    .filter((e) => {
      if (!e.expense_date) return false;
      const d = new Date(e.expense_date);
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      );
    })
    .reduce((s, e) => s + Number(e.amount), 0);

  const summary = {
    totalBeds: rooms.reduce((s, r) => s + r.capacity, 0),
    occupiedBeds: rooms.reduce((s, r) => s + r.occupied_beds, 0),
    availableBeds: rooms.reduce(
      (s, r) => s + (r.capacity - r.occupied_beds),
      0,
    ),
    activeStudents: studentTypeCounts.student,
    employeesStaying: studentTypeCounts.employee,
    pendingPayments: payments.filter((p) => p.status !== "paid").length,
    monthlyIncome: payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0),
    monthlyExpenses: monthlyExpenseTotal,
    salaryPending: salaries
      .filter((s) => s.status === "pending")
      .reduce((s, r) => s + Number(r.final_salary || 0), 0),
  };

  renderStats(summary);
  renderKeyRack(rooms);
  renderCharts(rooms, ie, studentTypeCounts);
  renderActivity(buildActivity(allStudents, payments, expenses, salaries));
  renderPendingPreview(payments);

  if (!isConfigured) {
    toast(
      "Running in demo mode — add your Supabase keys in js/config.js to load real data.",
      "error",
      5000,
    );
  }
}
