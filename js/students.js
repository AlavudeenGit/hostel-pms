import { initTheme } from "./theme.js";
import { requireSession } from "./auth.js";
import { renderShell } from "./shell.js";
import {
  listRooms,
  listStudents,
  createStudent,
  updateStudent,
  vacateStudent,
  deleteStudent,
  getRoomHistory,
  listPayments,
  getSettings,
  todayISO,
} from "./db.js";
import { uploadFile } from "./storage.js";
import {
  openModal,
  closeModal,
  openSlideover,
  closeSlideover,
  confirmDialog,
} from "./modal.js";
import { toast } from "./toast.js";
import { formatINR, formatDate, qs, qsa, initials } from "./utils.js";

initTheme();
await requireSession();
renderShell("students", {
  searchPlaceholder: "Search name, room, mobile, Aadhar…",
});

let students = [];
let rooms = [];
let activeTab = "active";
let filters = { search: "", personType: "", bike: "", mess: "", sharing: "" };

async function refresh() {
  [students, rooms] = await Promise.all([listStudents(), listRooms()]);
  renderTable();
}

function availableRooms() {
  return rooms.filter(
    (r) => r.status !== "maintenance" && r.occupied_beds < r.capacity,
  );
}

function renderTable() {
  const q = filters.search.trim().toLowerCase();
  const rows = students.filter((s) => {
    if (s.status !== activeTab) return false;
    if (filters.personType && s.type !== filters.personType) return false;
    if (filters.bike && (s.bike_available ? "yes" : "no") !== filters.bike)
      return false;
    if (filters.mess && (s.mess_available ? "yes" : "no") !== filters.mess)
      return false;
    if (filters.sharing && String(s.sharing_type) !== filters.sharing)
      return false;
    if (q) {
      const room = s.rooms ? String(s.rooms.room_number) : "";
      const hay =
        `${s.name} ${s.mobile} ${s.aadhar_number || ""} ${s.admission_number || ""} ${room}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const tbody = qs("#students-tbody");
  const emptyBox = qs("#students-empty");
  if (!rows.length) {
    tbody.innerHTML = "";
    emptyBox.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6"/></svg>
      <div class="et-title">No ${activeTab} residents match these filters</div>
    </div>`;
    return;
  }
  emptyBox.innerHTML = "";

  tbody.innerHTML = rows
    .map(
      (s) => `
    <tr class="student-row" data-id="${s.id}">
      <td class="name-cell" style="cursor:pointer;">${s.name}</td>
      <td style="text-transform:capitalize;">${s.type}</td>
      <td class="mono">${s.rooms ? s.rooms.room_number : "—"}</td>
      <td>${s.sharing_type}-Sharing</td>
      <td class="mono">${s.mobile}</td>
      <td>${s.mess_available ? `<span class="badge badge-green">Yes</span>` : `<span class="badge badge-grey">No</span>`}</td>
      <td>${s.bike_available ? `<span class="badge badge-blue">Yes</span>` : `<span class="badge badge-grey">No</span>`}</td>
      <td class="mono">${formatDate(s.joining_date)}</td>
      <td>${s.status === "vacated" ? `<span class="badge badge-grey">Vacated</span>` : `<span class="badge badge-green">Active</span>`}</td>
      <td><button class="btn btn-sm btn-ghost edit-student-row-btn" data-id="${s.id}">Edit</button></td>
    </tr>
  `,
    )
    .join("");

  qsa(".student-row .name-cell", tbody).forEach((cell) => {
    cell.addEventListener("click", () =>
      openProfile(cell.closest(".student-row").dataset.id),
    );
  });
  qsa(".edit-student-row-btn", tbody).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = students.find((x) => x.id === btn.dataset.id);
      if (s) openStudentFormModal(s);
    });
  });
}

/* ---------------- Add / Edit student (shared form) ---------------- */
async function openStudentFormModal(existing = null) {
  const isEdit = !!existing;
  // Include the student's current room in the option list even if it
  // reads as "full" (they already occupy a bed in it).
  const opts = availableRooms();
  if (
    isEdit &&
    existing.room_id &&
    !opts.some((r) => r.id === existing.room_id)
  ) {
    const currentRoom = rooms.find((r) => r.id === existing.room_id);
    if (currentRoom) opts.unshift(currentRoom);
  }
  const roomOptions = opts
    .map(
      (r) =>
        `<option value="${r.id}" ${isEdit && r.id === existing.room_id ? "selected" : ""}>${r.room_number} · Floor ${r.floor} · ${r.room_type}-Sharing${r.id === existing?.room_id ? " (current)" : ` (${r.capacity - r.occupied_beds} free)`}</option>`,
    )
    .join("");
  const settings = await getSettings();
  const defaultMess = Number(settings.mess_default || 0);
  const v = (key, fallback = "") =>
    isEdit ? (existing[key] ?? fallback) : fallback;
  const checked = (key) => (isEdit ? !!existing[key] : false);

  const el = openModal({
    title: isEdit ? `Edit — ${existing.name}` : "Add student / employee",
    sub: isEdit
      ? "Update any field. Documents are optional — leave blank to keep the current file."
      : "Only Name, Mobile, and Room are required — everything else can be filled in later.",
    wide: true,
    bodyHTML: `
      <form id="student-form">
        <div class="form-grid">
        <div class="f-field"><label>Admission Number</label><input type="text" id="f-admission-no" value="${v("admission_number")}" /></div>
          <div class="f-field span-2"><label>Full Name <span class="req">*</span></label><input type="text" id="f-name" value="${v("name")}" required /></div>

          <div class="f-field"><label>Mobile Number <span class="req">*</span></label><input type="tel" id="f-mobile" value="${v("mobile")}" required /></div>
          <div class="f-field"><label>Room <span class="req">*</span></label>
          <select id="f-room" required><option value="">Select a room</option>${roomOptions}</select></div>
          <div class="f-field"><label>Joining Date</label>
          <input type="date" id="f-joining" value="${v("joining_date", todayISO())}" /></div>
          

          <div class="f-field"><label>Student / Employee</label>
            <select id="f-type">
              <option value="student" ${v("type") === "student" ? "selected" : ""}>Student</option>
              <option value="employee" ${v("type") === "employee" ? "selected" : ""}>Employee</option>
            </select></div>


          <div class="f-field">
  <label>Blood Group</label>
  <select id="f-blood-group">
    <option value="" ${v("blood_group") === "" ? "selected" : ""}>Select Blood Group</option>
    <option value="A+" ${v("blood_group") === "A+" ? "selected" : ""}>A+</option>
    <option value="A-" ${v("blood_group") === "A-" ? "selected" : ""}>A-</option>
    <option value="B+" ${v("blood_group") === "B+" ? "selected" : ""}>B+</option>
    <option value="B-" ${v("blood_group") === "B-" ? "selected" : ""}>B-</option>
    <option value="AB+" ${v("blood_group") === "AB+" ? "selected" : ""}>AB+</option>
    <option value="AB-" ${v("blood_group") === "AB-" ? "selected" : ""}>AB-</option>
    <option value="O+" ${v("blood_group") === "O+" ? "selected" : ""}>O+</option>
    <option value="O-" ${v("blood_group") === "O-" ? "selected" : ""}>O-</option>
  </select>
</div>

          <div class="f-field"><label>Category</label>
            <select id="f-category">
              <option value="" ${v("category") === "" ? "selected" : ""}>Select category</option>
              <option value="TN" ${v("category") === "TN" ? "selected" : ""}>TN</option>
              <option value="KL" ${v("category") === "KL" ? "selected" : ""}>KL</option>
              <option value="NM" ${v("category") === "NM" ? "selected" : ""}>NM</option>
            </select></div>
   

          <div class="f-field"><label>Caution Deposit (₹)</label><input type="number" id="f-caution-deposit" min="0" value="${isEdit ? (existing.caution_deposit ?? "") : ""}" /></div>
          <div class="f-field"><label>Mess Deposit (₹)</label><input type="number" id="f-mess-deposit" min="0" value="${isEdit ? (existing.mess_deposit ?? "") : ""}" /></div>
          <div class="f-field"><label>Alternative Mobile</label><input type="tel" id="f-alt-mobile" value="${v("alt_mobile")}" /></div>
          <div class="f-field"><label>Email</label><input type="email" id="f-email" value="${v("email")}" /></div>
          <div class="f-field"><label>Mess Available</label>
            <div class="f-toggle" data-toggle="mess"><button type="button" data-val="true" class="${checked("mess_available") ? "active" : ""}">Yes</button><button type="button" data-val="false" class="${checked("mess_available") ? "" : "active"}">No</button></div></div>
          <div class="f-field"><label>Mess Charge (₹ / month)</label>
            <input type="number" id="f-mess-charge" min="0" value="${isEdit ? (existing.mess_charge ?? "") : ""}" placeholder="Default: ₹${defaultMess}" />
            <div class="hint">Independent per student — editable any time, doesn't affect anyone else.</div></div>
          <div class="f-field"><label>Bike Available</label>
            <div class="f-toggle" data-toggle="bike"><button type="button" data-val="true" class="${checked("bike_available") ? "active" : ""}">Yes</button><button type="button" data-val="false" class="${checked("bike_available") ? "" : "active"}">No</button></div></div>
          <div class="f-field"></div>

          <div class="f-field span-2"><label>Photo</label>
            <div class="f-upload"><input type="file" id="f-photo" accept="image/*" /><div>${isEdit ? "Click to replace photo" : "Click or drop a photo"}</div><div class="fname" id="f-photo-name"></div></div></div>

          <div class="f-field"><label>Aadhar Number</label><input type="text" id="f-aadhar" value="${v("aadhar_number")}" /></div>
          <div class="f-field"><label>Driving License Number</label><input type="text" id="f-license-no" value="${v("license_number")}" /></div>

          <div class="f-field"><label>Aadhar Front Image</label>
            <div class="f-upload"><input type="file" id="f-aadhar-front" accept="image/*" /><div>${isEdit ? "Replace front (optional)" : "Upload front (optional)"}</div><div class="fname" id="f-aadhar-front-name"></div></div></div>
          <div class="f-field"><label>Aadhar Back Image</label>
            <div class="f-upload"><input type="file" id="f-aadhar-back" accept="image/*" /><div>${isEdit ? "Replace back (optional)" : "Upload back (optional)"}</div><div class="fname" id="f-aadhar-back-name"></div></div></div>

          <div class="f-field span-2"><label>Driving License Image</label>
            <div class="f-upload"><input type="file" id="f-license-img" accept="image/*" /><div>Upload license (optional)</div><div class="fname" id="f-license-img-name"></div></div></div>

          <div class="f-field span-2"><label>Permanent Address</label><textarea id="f-perm-addr">${v("permanent_address")}</textarea></div>
          <div class="f-field span-2"><label>Current Address</label><textarea id="f-cur-addr">${v("current_address")}</textarea></div>

          <div class="f-field"><label>Guardian Name</label><input type="text" id="f-guardian" value="${v("guardian_name")}" /></div>
          <div class="f-field"><label>Guardian Mobile</label><input type="tel" id="f-guardian-mobile" value="${v("guardian_mobile")}" /></div>

          <div class="f-field span-2"><label>Remarks</label><textarea id="f-remarks">${v("remarks")}</textarea></div>
        </div>
      </form>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="student-save">${isEdit ? "Save changes" : "Save student"}</button>`,
  });

  qsa(".f-toggle", el).forEach((toggle) => {
    qsa("button", toggle).forEach((btn) => {
      btn.addEventListener("click", () => {
        qsa("button", toggle).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  });

  qsa(".f-upload input[type=file]", el).forEach((input) => {
    input.addEventListener("change", () => {
      const nameEl = qs(`#${input.id}-name`, el);
      if (nameEl) nameEl.textContent = input.files[0]?.name || "";
    });
  });

  el.querySelector("#student-save").addEventListener("click", async () => {
    const required = ["#f-name", "#f-mobile", "#f-room"];
    for (const sel of required) {
      if (!qs(sel, el).value.trim()) {
        toast("Name, Mobile Number, and Room are required.", "error");
        return;
      }
    }
    const btn = el.querySelector("#student-save");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const [photoFile, frontFile, backFile, licenseFile] = [
        qs("#f-photo", el).files[0],
        qs("#f-aadhar-front", el).files[0],
        qs("#f-aadhar-back", el).files[0],
        qs("#f-license-img", el).files[0],
      ];
      const [photo_url, aadhar_front_url, aadhar_back_url, license_url] =
        await Promise.all([
          photoFile
            ? uploadFile(photoFile, "photos")
            : Promise.resolve(isEdit ? existing.photo_url : ""),
          frontFile
            ? uploadFile(frontFile, "documents")
            : Promise.resolve(isEdit ? existing.aadhar_front_url : ""),
          backFile
            ? uploadFile(backFile, "documents")
            : Promise.resolve(isEdit ? existing.aadhar_back_url : ""),
          licenseFile
            ? uploadFile(licenseFile, "documents")
            : Promise.resolve(isEdit ? existing.license_url : ""),
        ]);

      const room = rooms.find((r) => r.id === qs("#f-room", el).value);
      const payload = {
        name: qs("#f-name", el).value.trim(),
        mobile: qs("#f-mobile", el).value.trim(),
        alt_mobile: qs("#f-alt-mobile", el).value.trim(),
        email: qs("#f-email", el).value.trim(),
        type: qs("#f-type", el).value,
        room_id: room.id,
        sharing_type: room.room_type,
        admission_number: qs("#f-admission-no", el).value.trim(),
        blood_group: qs("#f-blood-group", el).value.trim(),
        category: qs("#f-category", el).value || null,
        caution_deposit:
          qs("#f-caution-deposit", el).value.trim() !== ""
            ? Number(qs("#f-caution-deposit", el).value)
            : 0,
        mess_deposit:
          qs("#f-mess-deposit", el).value.trim() !== ""
            ? Number(qs("#f-mess-deposit", el).value)
            : 0,
        mess_available:
          qs('[data-toggle="mess"] .active', el).dataset.val === "true",
        mess_charge:
          qs("#f-mess-charge", el).value.trim() !== ""
            ? Number(qs("#f-mess-charge", el).value)
            : defaultMess,
        bike_available:
          qs('[data-toggle="bike"] .active', el).dataset.val === "true",
        photo_url,
        aadhar_front_url,
        aadhar_back_url,
        license_url,
        aadhar_number: qs("#f-aadhar", el).value.trim(),
        license_number: qs("#f-license-no", el).value.trim(),
        permanent_address: qs("#f-perm-addr", el).value.trim(),
        current_address: qs("#f-cur-addr", el).value.trim(),
        guardian_name: qs("#f-guardian", el).value.trim(),
        guardian_mobile: qs("#f-guardian-mobile", el).value.trim(),
        joining_date: qs("#f-joining", el).value || todayISO(),
        remarks: qs("#f-remarks", el).value.trim(),
      };

      if (isEdit) {
        await updateStudent(existing.id, payload);
        toast(`${payload.name} updated.`);
      } else {
        await createStudent(payload);
        toast(`${payload.name} added to Room ${room.room_number}.`);
      }
      closeModal();
      closeSlideover();
      refresh();
    } catch (err) {
      toast(err.message || "Could not save student.", "error");
      btn.disabled = false;
      btn.textContent = isEdit ? "Save changes" : "Save student";
    }
  });
}

/* ---------------- Profile slideover ---------------- */
async function openProfile(id) {
  const s = students.find((st) => st.id === id);
  if (!s) return;
  const [history, payments] = await Promise.all([
    getRoomHistory(id),
    listPayments(),
  ]);
  const myPayments = payments
    .filter((p) => p.student_id === id)
    .sort((a, b) => new Date(b.month_year) - new Date(a.month_year));
  const totalPaid = myPayments.reduce(
    (sum, p) => sum + Number(p.amount_paid || 0),
    0,
  );
  const outstanding = myPayments.reduce(
    (sum, p) => sum + Number(p.balance || 0),
    0,
  );

  const panel = openSlideover({
    title: s.name,
    sub: `${s.type === "employee" ? "Employee" : "Student"} · Room ${s.rooms ? s.rooms.room_number : "—"} · ${s.status === "vacated" ? "Vacated" : "Active"}`,
    bodyHTML: `
      <div class="so-tabs">
        <button class="so-tab active" data-tab="overview">Overview</button>
        <button class="so-tab" data-tab="documents">Documents</button>
        <button class="so-tab" data-tab="history">Room history</button>
        <button class="so-tab" data-tab="payments">Payments</button>
      </div>
      <div class="so-body" id="so-content"></div>
    `,
  });

  function paneOverview() {
    return `
      <div class="so-section">
        <h4>Personal</h4>
        <div class="so-kv">
          <div><div class="k">Mobile</div><div class="v mono">${s.mobile}</div></div>
          <div><div class="k">Alt. Mobile</div><div class="v mono">${s.alt_mobile || "—"}</div></div>
          <div><div class="k">Email</div><div class="v">${s.email || "—"}</div></div>
          <div><div class="k">Aadhar</div><div class="v mono">${s.aadhar_number || "—"}</div></div>
          <div><div class="k">Joined</div><div class="v">${formatDate(s.joining_date)}</div></div>
          ${s.status === "vacated" ? `<div><div class="k">Vacated</div><div class="v">${formatDate(s.vacated_date)}</div></div>` : ""}
        </div>
      </div>
      <div class="so-section">
        <h4>Admission &amp; category</h4>
        <div class="so-kv">
          <div><div class="k">Admission No.</div><div class="v mono">${s.admission_number || "—"}</div></div>
          <div><div class="k">Blood Group</div><div class="v">${s.blood_group || "—"}</div></div>
          <div><div class="k">Category</div><div class="v">${s.category || "—"}</div></div>
          <div><div class="k">Caution Deposit</div><div class="v num">${formatINR(s.caution_deposit || 0)}</div></div>
          <div><div class="k">Mess Deposit</div><div class="v num">${formatINR(s.mess_deposit || 0)}</div></div>
        </div>
      </div>
      ${s.status === "vacated" ? `<div class="so-section"><h4>Vacate reason</h4><p style="font-size:13px; color:var(--ink-soft);">${s.vacated_reason || "—"}</p></div>` : ""}
      <div class="so-section">
        <h4>Guardian</h4>
        <div class="so-kv">
          <div><div class="k">Name</div><div class="v">${s.guardian_name || "—"}</div></div>
          <div><div class="k">Mobile</div><div class="v mono">${s.guardian_mobile || "—"}</div></div>
        </div>
      </div>
      <div class="so-section">
        <h4>Addresses</h4>
        <div class="so-kv">
          <div><div class="k">Permanent</div><div class="v">${s.permanent_address || "—"}</div></div>
          <div><div class="k">Current</div><div class="v">${s.current_address || "—"}</div></div>
        </div>
      </div>
      <div class="so-section">
        <h4>Mess &amp; bike</h4>
        <div class="so-kv">
          <div><div class="k">Mess Available</div><div class="v">${s.mess_available ? "Yes" : "No"}</div></div>
          <div><div class="k">Mess Charge</div><div class="v num">${s.mess_available ? formatINR(s.mess_charge || 0) + "/mo" : "—"}</div></div>
          <div><div class="k">Bike Available</div><div class="v">${s.bike_available ? "Yes" : "No"}</div></div>
        </div>
        <button class="btn btn-sm btn-ghost" id="edit-mess-btn" style="margin-top:var(--space-3);">Edit mess charge</button>
      </div>
      <div class="so-section">
        <button class="btn btn-primary" id="edit-student-btn" style="width:100%; justify-content:center;">Edit student details</button>
      </div>
      <div class="so-section">
        <h4>Ledger summary</h4>
        <div class="so-kv">
          <div><div class="k">Total Paid</div><div class="v num" style="color:var(--ledger-green)">${formatINR(totalPaid)}</div></div>
          <div><div class="k">Outstanding</div><div class="v num" style="color:${outstanding > 0 ? "var(--ledger-red)" : "var(--ledger-green)"}">${formatINR(outstanding)}</div></div>
        </div>
      </div>
      ${s.status === "active" ? `<button class="btn btn-primary" id="vacate-btn" style="width:100%; justify-content:center;">Vacate student</button>` : ""}
      <div class="so-section" style="margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--line);">
        <button class="btn btn-ghost" id="delete-student-btn" style="width:100%; justify-content:center; color:var(--ledger-red); border-color:var(--ledger-red-bg);">Delete student</button>
        <div class="hint" style="text-align:center; margin-top:6px;">Permanent — removes this record and its payment history entirely. Use <b>Vacate</b> instead for a normal move-out.</div>
      </div>
    `;
  }

  function paneDocuments() {
    const docs = [
      { label: "Photo", url: s.photo_url },
      { label: "Aadhar Front", url: s.aadhar_front_url },
      { label: "Aadhar Back", url: s.aadhar_back_url },
      { label: "License", url: s.license_url },
    ];
    return `<div class="form-grid">${docs
      .map(
        (d) => `
      <div class="f-field"><label>${d.label}</label>
        <div class="doc-thumb">${d.url ? `<img src="${d.url}" alt="${d.label}" />` : "No file"}</div>
      </div>`,
      )
      .join("")}</div>`;
  }

  function paneHistory() {
    if (!history.length)
      return `<div class="empty-state"><div class="et-title">No room history yet</div></div>`;
    return `<table class="reg-table"><thead><tr><th>Room</th><th>Assigned</th><th>Vacated</th></tr></thead><tbody>
      ${history.map((h) => `<tr><td class="mono">${h.rooms ? h.rooms.room_number : "—"}</td><td>${formatDate(h.assigned_date)}</td><td>${h.vacated_date ? formatDate(h.vacated_date) : "Current"}</td></tr>`).join("")}
    </tbody></table>`;
  }

  function panePayments() {
    if (!myPayments.length)
      return `<div class="empty-state"><div class="et-title">No payment records yet</div></div>`;
    const statusBadge = {
      paid: "badge-green",
      partial: "badge-amber",
      pending: "badge-red",
    };
    return `<table class="reg-table"><thead><tr><th>Month</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>
      ${myPayments
        .map(
          (p) => `<tr>
        <td>${formatDate(p.month_year)}</td>
        <td class="num">${formatINR(p.total_amount)}</td>
        <td class="num">${formatINR(p.amount_paid)}</td>
        <td class="num">${formatINR(p.balance)}</td>
        <td><span class="badge ${statusBadge[p.status]}">${p.status}</span></td>
      </tr>`,
        )
        .join("")}
    </tbody></table>`;
  }

  const panes = {
    overview: paneOverview,
    documents: paneDocuments,
    history: paneHistory,
    payments: panePayments,
  };

  function showPane(name) {
    qs("#so-content", panel).innerHTML = panes[name]();
    if (name === "overview") {
      const vacateBtn = qs("#vacate-btn", panel);
      if (vacateBtn)
        vacateBtn.addEventListener("click", () => attemptVacate(s));
      const editMessBtn = qs("#edit-mess-btn", panel);
      if (editMessBtn)
        editMessBtn.addEventListener("click", () =>
          openEditMessModal(s, () => showPane("overview")),
        );
      const editStudentBtn = qs("#edit-student-btn", panel);
      if (editStudentBtn)
        editStudentBtn.addEventListener("click", () => openStudentFormModal(s));
      const deleteBtn = qs("#delete-student-btn", panel);
      if (deleteBtn)
        deleteBtn.addEventListener("click", () => confirmDeleteStudent(s));
    }
  }

  qsa(".so-tab", panel).forEach((tab) => {
    tab.addEventListener("click", () => {
      qsa(".so-tab", panel).forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      showPane(tab.dataset.tab);
    });
  });

  showPane("overview");
}

function openEditMessModal(s, onSaved) {
  const el = openModal({
    title: `Edit mess charge — ${s.name}`,
    sub: "This only changes this student's own charge — no one else is affected.",
    bodyHTML: `
      <div class="form-grid">
        <div class="f-field"><label>Mess Available</label>
          <div class="f-toggle" data-toggle="edit-mess">
            <button type="button" data-val="true" class="${s.mess_available ? "active" : ""}">Yes</button>
            <button type="button" data-val="false" class="${s.mess_available ? "" : "active"}">No</button>
          </div>
        </div>
        <div class="f-field"><label>Mess Charge (₹ / month)</label>
          <input type="number" id="edit-mess-charge" min="0" value="${s.mess_charge || 0}" /></div>
      </div>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="edit-mess-save">Save</button>`,
  });
  qsa('[data-toggle="edit-mess"] button', el).forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa('[data-toggle="edit-mess"] button', el).forEach((b) =>
        b.classList.remove("active"),
      );
      btn.classList.add("active");
    });
  });
  el.querySelector("#edit-mess-save").addEventListener("click", async () => {
    const mess_available =
      qs('[data-toggle="edit-mess"] .active', el).dataset.val === "true";
    const mess_charge = Number(qs("#edit-mess-charge", el).value || 0);
    const updated = await updateStudent(s.id, { mess_available, mess_charge });
    Object.assign(s, updated);
    const idx = students.findIndex((x) => x.id === s.id);
    if (idx > -1) students[idx] = { ...students[idx], ...updated };
    toast(`Mess charge updated for ${s.name}.`);
    closeModal();
    if (onSaved) onSaved();
  });
}

async function attemptVacate(s) {
  // Re-check fresh, authoritative payment records right before vacating —
  // never rely on a possibly-stale figure computed earlier in the session.
  const allPayments = await listPayments();
  const outstanding = allPayments
    .filter((p) => p.student_id === s.id)
    .reduce((sum, p) => sum + Number(p.balance || 0), 0);

  if (outstanding > 0) {
    toast(
      `${s.name} has ${formatINR(outstanding)} in pending payments. Please collect it before vacating.`,
      "error",
      5000,
    );
    return;
  }
  openVacateModal(s);
}

function confirmDeleteStudent(s) {
  confirmDialog({
    title: `Delete ${s.name}?`,
    message: `This permanently removes <b>${s.name}</b> and all of their payment history, room history, and documents. This cannot be undone. If they're simply moving out, use <b>Vacate</b> instead to keep their record.`,
    confirmLabel: "Delete permanently",
    danger: true,
    onConfirm: async () => {
      try {
        await deleteStudent(s.id);
        toast(`${s.name} has been deleted.`);
        closeSlideover();
        refresh();
      } catch (err) {
        toast(err.message || "Could not delete this student.", "error");
      }
    },
  });
}

function openVacateModal(s) {
  const el = openModal({
    title: `Vacate ${s.name}`,
    sub: "This preserves all history — the student is never deleted.",
    bodyHTML: `
      <div class="form-grid">
        <div class="f-field"><label>Vacated Date <span class="req">*</span></label><input type="date" id="v-date" value="${todayISO()}" /></div>
        <div class="f-field span-2"><label>Reason</label><textarea id="v-reason" placeholder="e.g. Completed course, relocating…"></textarea></div>
      </div>
    `,
    footHTML: `<button class="btn btn-ghost" data-close-modal>Cancel</button><button class="btn btn-primary" id="v-confirm">Confirm vacate</button>`,
  });
  el.querySelector("#v-confirm").addEventListener("click", async () => {
    const btn = el.querySelector("#v-confirm");
    btn.disabled = true;
    btn.textContent = "Vacating…";
    try {
      await vacateStudent(s.id, {
        vacated_date: qs("#v-date", el).value,
        vacated_reason: qs("#v-reason", el).value.trim(),
      });
      toast(`${s.name} marked as vacated.`);
      closeModal();
      closeSlideover();
      refresh();
    } catch (err) {
      toast(err.message || "Could not vacate this student.", "error", 5000);
      btn.disabled = false;
      btn.textContent = "Confirm vacate";
    }
  });
}

/* ---------------- Wiring ---------------- */
qs("#add-student-btn").addEventListener("click", () => openStudentFormModal());
qs("#s-search").addEventListener("input", (e) => {
  filters.search = e.target.value;
  renderTable();
});
qs("#filter-persontype").addEventListener("change", (e) => {
  filters.personType = e.target.value;
  renderTable();
});
qs("#filter-bike").addEventListener("change", (e) => {
  filters.bike = e.target.value;
  renderTable();
});
qs("#filter-mess").addEventListener("change", (e) => {
  filters.mess = e.target.value;
  renderTable();
});
qs("#filter-sharing").addEventListener("change", (e) => {
  filters.sharing = e.target.value;
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
