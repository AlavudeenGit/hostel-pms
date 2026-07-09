import { initTheme } from "./theme.js";
import { requireSession } from "./auth.js";
import { renderShell } from "./shell.js";
import { listRooms, createRoom, updateRoom, listStudents } from "./db.js";
import { openModal, closeModal, confirmDialog } from "./modal.js";
import { toast } from "./toast.js";
import { qs, qsa } from "./utils.js";

initTheme();
await requireSession();
renderShell("rooms", { searchPlaceholder: "Search rooms, students…" });

let rooms = [];
let activeStudents = [];
let filters = { search: "", floor: "", type: "", status: "" };

async function refresh() {
  [rooms, activeStudents] = await Promise.all([
    listRooms(),
    listStudents({ status: "active" }),
  ]);
  populateFloorFilter();
  renderStats();
  renderTable();
}

function populateFloorFilter() {
  const sel = qs("#filter-floor");
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const current = sel.value;
  sel.innerHTML =
    `<option value="">All floors</option>` +
    floors.map((f) => `<option value="${f}">Floor ${f}</option>`).join("");
  sel.value = current;
}

function renderStats() {
  const totalBeds = rooms.reduce((s, r) => s + r.capacity, 0);
  const occupied = rooms.reduce((s, r) => s + r.occupied_beds, 0);
  const maintenance = rooms.filter((r) => r.status === "maintenance").length;
  const full = rooms.filter((r) => r.status === "full").length;
  const cards = [
    { tag: "Total Rooms", value: rooms.length },
    { tag: "Total Beds", value: totalBeds },
    { tag: "Occupied Beds", value: occupied },
    { tag: "Available Beds", value: totalBeds - occupied },
  ];
  qs("#room-stats").innerHTML = cards
    .map(
      (c) => `
    <div class="stat-card"><div class="tag">${c.tag}</div><div class="value num">${c.value}</div></div>
  `,
    )
    .join("");
}

function residentsFor(roomId) {
  return activeStudents.filter((s) => s.room_id === roomId);
}

function renderTable() {
  const q = filters.search.trim().toLowerCase();
  const rows = rooms.filter((r) => {
    if (filters.floor && String(r.floor) !== filters.floor) return false;
    if (filters.type && String(r.room_type) !== filters.type) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (q && !String(r.room_number).toLowerCase().includes(q)) return false;
    return true;
  });

  const tbody = qs("#rooms-tbody");
  const emptyBox = qs("#rooms-empty");

  if (!rows.length) {
    tbody.innerHTML = "";
    emptyBox.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 21V9.5L12 4l8 5.5V21"/><path d="M9 21v-7h6v7"/></svg>
      <div class="et-title">No rooms match these filters</div>
      <div>Try clearing a filter, or add a new room.</div>
    </div>`;
    return;
  }
  emptyBox.innerHTML = "";

  const statusBadge = {
    available: "badge-green",
    full: "badge-blue",
    maintenance: "badge-grey",
  };
  const statusLabel = {
    available: "Available",
    full: "Full",
    maintenance: "Maintenance",
  };

  tbody.innerHTML = rows
    .map((r) => {
      const residents = residentsFor(r.id);
      const names = residents.map((s) => s.name).join(", ") || "—";
      return `
      <tr>
        <td>${r.floor}</td>
        <td class="name-cell mono">${r.room_number}</td>
        <td>${r.room_type}-Sharing</td>
        <td class="num">${r.capacity}</td>
        <td class="num">${r.occupied_beds}</td>
        <td class="num">${Math.max(0, r.capacity - r.occupied_beds)}</td>
        <td><span class="badge ${statusBadge[r.status] || "badge-grey"}">${statusLabel[r.status] || r.status}</span></td>
        <td style="max-width:220px; white-space:normal; font-size:12px; color:var(--ink-faint);">${names}</td>
        <td>
          <select class="tb-filter-sm room-status-select" data-room="${r.id}">
            <option value="available" ${r.status === "available" ? "selected" : ""}>Available</option>
            <option value="maintenance" ${r.status === "maintenance" ? "selected" : ""}>Maintenance</option>
          </select>
        </td>
      </tr>`;
    })
    .join("");

  qsa(".room-status-select", tbody).forEach((sel) => {
    sel.addEventListener("change", async () => {
      const room = rooms.find((r) => r.id === sel.dataset.room);
      if (room.occupied_beds > 0 && sel.value === "maintenance") {
        toast(
          "Can't set an occupied room to maintenance — vacate residents first.",
          "error",
        );
        sel.value = room.status;
        return;
      }
      await updateRoom(room.id, { status: sel.value });
      toast(`Room ${room.room_number} marked ${sel.value}.`);
      refresh();
    });
  });
}

function openAddRoomModal() {
  const el = openModal({
    title: "Add room",
    sub: "New rooms start as Available with zero occupancy.",
    bodyHTML: `
      <form id="room-form">
        <div class="form-grid">
          <div class="f-field"><label>Floor <span class="req">*</span></label>
            <input type="number" id="f-floor" min="1" required /></div>
          <div class="f-field"><label>Room Number <span class="req">*</span></label>
            <input type="text" id="f-room-number" required /></div>
          <div class="f-field span-2"><label>Room Type <span class="req">*</span></label>
            <select id="f-type" required>
              <option value="2">2-Sharing</option>
              <option value="3">3-Sharing</option>
            </select>
          </div>
        </div>
      </form>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="room-save">Add room</button>`,
  });

  el.querySelector("#room-save").addEventListener("click", async () => {
    const floor = qs("#f-floor").value;
    const room_number = qs("#f-room-number").value.trim();
    const room_type = qs("#f-type").value;
    if (!floor || !room_number) {
      toast("Floor and room number are required.", "error");
      return;
    }
    if (rooms.some((r) => String(r.room_number) === room_number)) {
      toast("A room with that number already exists.", "error");
      return;
    }
    try {
      await createRoom({ floor, room_number, room_type });
      toast(`Room ${room_number} added.`);
      closeModal();
      refresh();
    } catch (err) {
      toast(err.message || "Could not add room.", "error");
    }
  });
}

qs("#add-room-btn").addEventListener("click", openAddRoomModal);
qs("#room-search").addEventListener("input", (e) => {
  filters.search = e.target.value;
  renderTable();
});
qs("#filter-floor").addEventListener("change", (e) => {
  filters.floor = e.target.value;
  renderTable();
});
qs("#filter-type").addEventListener("change", (e) => {
  filters.type = e.target.value;
  renderTable();
});
qs("#filter-status").addEventListener("change", (e) => {
  filters.status = e.target.value;
  renderTable();
});

refresh();
