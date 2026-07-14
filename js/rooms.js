import { initTheme } from "./theme.js";
import { requireSession } from "./auth.js";
import { renderShell } from "./shell.js";
import {
  listRooms,
  createRoom,
  updateRoom,
  updateRoomDetails,
  listStudents,
} from "./db.js";
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
  renderAll();
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

function getFilteredRooms() {
  const q = filters.search.trim().toLowerCase();
  return rooms.filter((r) => {
    if (filters.floor && String(r.floor) !== filters.floor) return false;
    if (filters.type && String(r.room_type) !== filters.type) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (q && !String(r.room_number).toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderStats(filteredRooms) {
  const totalBeds = filteredRooms.reduce((s, r) => s + r.capacity, 0);
  const occupied = filteredRooms.reduce((s, r) => s + r.occupied_beds, 0);
  const hasFilter =
    filters.floor || filters.type || filters.status || filters.search.trim();
  const cards = [
    { tag: "Total Rooms", value: filteredRooms.length },
    { tag: "Total Beds", value: totalBeds },
    { tag: "Occupied Beds", value: occupied },
    { tag: "Available Beds", value: totalBeds - occupied },
  ];
  qs("#room-stats").innerHTML =
    cards
      .map(
        (c) => `
    <div class="stat-card"><div class="tag">${c.tag}</div><div class="value num">${c.value}</div></div>
  `,
      )
      .join("") +
    (hasFilter
      ? `<div class="filter-stats-note">Showing stats for the current filter${filterSummary()}</div>`
      : "");
}

function filterSummary() {
  const parts = [];
  if (filters.floor) parts.push(`Floor ${filters.floor}`);
  if (filters.type) parts.push(`${filters.type}-Sharing`);
  if (filters.status)
    parts.push(filters.status[0].toUpperCase() + filters.status.slice(1));
  if (filters.search.trim()) parts.push(`"${filters.search.trim()}"`);
  return parts.length ? `: ${parts.join(" · ")}` : "";
}

function residentsFor(roomId) {
  return activeStudents.filter((s) => s.room_id === roomId);
}

function renderAll() {
  const filtered = getFilteredRooms();
  renderStats(filtered);
  renderTable(filtered);
}

function renderTable(rows) {
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
          <div style="display:flex; align-items:center; gap:6px;">
            <select class="tb-filter-sm room-status-select" data-room="${r.id}">
              <option value="available" ${r.status === "available" ? "selected" : ""}>Available</option>
              <option value="maintenance" ${r.status === "maintenance" ? "selected" : ""}>Maintenance</option>
            </select>
            <button class="btn btn-sm btn-ghost edit-room-btn" data-room="${r.id}">Edit</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  qsa(".edit-room-btn", tbody).forEach((btn) => {
    btn.addEventListener("click", () => {
      const room = rooms.find((r) => r.id === btn.dataset.room);
      if (room) openEditRoomModal(room);
    });
  });

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

function openEditRoomModal(room) {
  const residents = residentsFor(room.id);
  const el = openModal({
    title: `Edit Room ${room.room_number}`,
    sub: residents.length
      ? `${residents.length} active resident(s) here — changing Sharing Type also updates their rent tier.`
      : "No active residents in this room right now.",
    bodyHTML: `
      <form id="room-edit-form">
        <div class="form-grid">
          <div class="f-field"><label>Floor <span class="req">*</span></label>
            <input type="number" id="e-floor" min="1" value="${room.floor}" required /></div>
          <div class="f-field"><label>Room Number <span class="req">*</span></label>
            <input type="text" id="e-room-number" value="${room.room_number}" required /></div>
          <div class="f-field span-2"><label>Room Type (Sharing) <span class="req">*</span></label>
            <select id="e-type" required>
              <option value="2" ${Number(room.room_type) === 2 ? "selected" : ""}>2-Sharing</option>
              <option value="3" ${Number(room.room_type) === 3 ? "selected" : ""}>3-Sharing</option>
            </select>
            <div class="hint">Currently ${room.occupied_beds} of ${room.capacity} beds occupied.</div>
          </div>
        </div>
      </form>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="room-edit-save">Save changes</button>`,
  });

  el.querySelector("#room-edit-save").addEventListener("click", async () => {
    const floor = qs("#e-floor", el).value;
    const room_number = qs("#e-room-number", el).value.trim();
    const room_type = qs("#e-type", el).value;
    if (!floor || !room_number) {
      toast("Floor and room number are required.", "error");
      return;
    }

    const btn = el.querySelector("#room-edit-save");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await updateRoomDetails(room.id, { floor, room_number, room_type });
      toast(
        `Room ${room_number} updated — changes are reflected across the dashboard, students, and reports.`,
      );
      closeModal();
      refresh();
    } catch (err) {
      toast(err.message || "Could not update room.", "error");
      btn.disabled = false;
      btn.textContent = "Save changes";
    }
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
  renderAll();
});
qs("#filter-floor").addEventListener("change", (e) => {
  filters.floor = e.target.value;
  renderAll();
});
qs("#filter-type").addEventListener("change", (e) => {
  filters.type = e.target.value;
  renderAll();
});
qs("#filter-status").addEventListener("change", (e) => {
  filters.status = e.target.value;
  renderAll();
});

refresh();
