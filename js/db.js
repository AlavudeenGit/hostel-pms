import { supabase, isConfigured } from "./supabaseClient.js";
import { mockDb } from "./mockDb.js";

// IMPORTANT: never derive date-only strings via toISOString(). It converts
// to UTC first, and for any timezone ahead of UTC (e.g. India, UTC+5:30)
// local midnight becomes 18:30 the *previous* day in UTC — so
// `new Date(y, m, 1).toISOString()` silently returns the last day of the
// previous month, every single time, for every IST user. Build the
// date-only string from local components instead.
const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const monthStartISO = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;

/* ================================================================
   ROOMS
   ================================================================ */
export async function listRooms() {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .order("floor")
      .order("room_number");
    if (error) throw error;
    return data;
  }
  return [...mockDb.get("rooms")].sort(
    (a, b) => a.floor - b.floor || a.room_number - b.room_number,
  );
}

export async function createRoom(room) {
  const payload = {
    floor: Number(room.floor),
    room_number: Number(room.room_number),
    room_type: Number(room.room_type),
    capacity: Number(room.room_type),
    occupied_beds: 0,
    status: "available",
  };
  if (isConfigured) {
    const { data, error } = await supabase
      .from("rooms")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return mockDb.insert("rooms", payload);
}

export async function updateRoom(id, patch) {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("rooms")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return mockDb.update("rooms", id, patch);
}

// Full room-details edit (floor / room number / sharing type) — used to
// correct mistakes like a room created as 3-Sharing instead of 2-Sharing.
// Floor and Room Number are read live via the students↔rooms join
// everywhere in the app, so correcting them here already propagates
// everywhere automatically. Sharing Type is different: each student also
// stores their own `sharing_type` (used for rent calculation), so we
// cascade that change to every currently-active student in the room —
// otherwise rent generation would keep using the old, incorrect tier.
export async function updateRoomDetails(id, { floor, room_number, room_type }) {
  const rooms = await listRooms();
  const room = rooms.find((r) => r.id === id);
  if (!room) throw new Error("Room not found.");

  const newFloor = Number(floor);
  const newRoomNumber = Number(room_number);
  const newType = Number(room_type);
  const newCapacity = newType;
  const typeChanged = newType !== Number(room.room_type);

  if (
    rooms.some((r) => r.id !== id && Number(r.room_number) === newRoomNumber)
  ) {
    throw new Error(
      `Room ${newRoomNumber} already exists — choose a different room number.`,
    );
  }
  if (room.occupied_beds > newCapacity) {
    throw new Error(
      `This room currently has ${room.occupied_beds} occupant(s). Move or vacate down to ${newCapacity} before switching to ${newType}-Sharing.`,
    );
  }

  const status =
    room.status === "maintenance"
      ? "maintenance"
      : room.occupied_beds >= newCapacity
        ? "full"
        : "available";
  const patch = {
    floor: newFloor,
    room_number: newRoomNumber,
    room_type: newType,
    capacity: newCapacity,
    status,
  };

  if (isConfigured) {
    const { data, error } = await supabase
      .from("rooms")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (typeChanged) {
      const { error: studErr } = await supabase
        .from("students")
        .update({ sharing_type: newType })
        .eq("room_id", id)
        .eq("status", "active");
      if (studErr) throw studErr;
      await cascadeRentForRoom(id, newType);
    }
    return data;
  }

  const updated = mockDb.update("rooms", id, patch);
  if (typeChanged) {
    const students = mockDb
      .get("students")
      .map((s) =>
        s.room_id === id && s.status === "active"
          ? { ...s, sharing_type: newType }
          : s,
      );
    mockDb.set("students", students);
    await cascadeRentForRoom(id, newType);
  }
  return updated;
}

// Updates the current month's *unpaid/partial* payment rows for every
// active student in this room to the corrected rent tier. Already-paid
// records are left untouched — we never silently rewrite a settled
// invoice, only bring forward-looking, uncollected amounts in line with
// the corrected room configuration.
async function cascadeRentForRoom(roomId, newType) {
  const settings = await getSettings();
  const month = monthStartISO();
  const students = (await listStudents({ status: "active" })).filter(
    (s) => s.room_id === roomId,
  );
  const payments = await listPayments({ month });

  for (const s of students) {
    const rentKey = `${s.type}_rent_${newType}`;
    const newRent = Number(settings[rentKey] || 0);
    const existingPayment = payments.find((p) => p.student_id === s.id);
    if (
      existingPayment &&
      existingPayment.status !== "paid" &&
      Number(existingPayment.room_rent) !== newRent
    ) {
      await collectPayment(existingPayment.id, { room_rent: newRent });
    }
  }
}

function recomputeRoomMock(roomId) {
  const rooms = mockDb.get("rooms");
  const students = mockDb.get("students");
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return;
  const occupied = students.filter(
    (s) => s.room_id === roomId && s.status === "active",
  ).length;
  room.occupied_beds = occupied;
  if (room.status !== "maintenance") {
    room.status = occupied >= room.capacity ? "full" : "available";
  }
  mockDb.set("rooms", rooms);
}

// The DB has a trigger that's supposed to keep occupied_beds/status in
// sync, but we don't rely on that alone — a migration that hasn't been
// (re)applied would silently leave rooms stale. Recompute explicitly from
// the client after every student mutation that could affect occupancy.
async function recalcRoomOccupancySupabase(roomId) {
  if (!roomId) return;
  const { count, error: countErr } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("status", "active");
  if (countErr) throw countErr;

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("capacity, status")
    .eq("id", roomId)
    .single();
  if (roomErr) throw roomErr;

  const status =
    room.status === "maintenance"
      ? "maintenance"
      : count >= room.capacity
        ? "full"
        : "available";
  const { error: updateErr } = await supabase
    .from("rooms")
    .update({ occupied_beds: count, status })
    .eq("id", roomId);
  if (updateErr) throw updateErr;
}

/* ================================================================
   STUDENTS / EMPLOYEES
   ================================================================ */
export async function listStudents({ status } = {}) {
  if (isConfigured) {
    let q = supabase
      .from("students")
      .select("*, rooms(room_number, floor, room_type)")
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  const rooms = mockDb.get("rooms");
  let rows = mockDb.get("students");
  if (status) rows = rows.filter((s) => s.status === status);
  return rows
    .map((s) => ({
      ...s,
      rooms: rooms.find((r) => r.id === s.room_id) || null,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getStudent(id) {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("students")
      .select("*, rooms(room_number, floor, room_type)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }
  const rooms = mockDb.get("rooms");
  const s = mockDb.get("students").find((r) => r.id === id);
  return s
    ? { ...s, rooms: rooms.find((r) => r.id === s.room_id) || null }
    : null;
}

export async function createStudent(payload) {
  const capacityCheckRoom = (await listRooms()).find(
    (r) => r.id === payload.room_id,
  );
  if (!capacityCheckRoom) throw new Error("Please choose a valid room.");
  if (capacityCheckRoom.status === "maintenance")
    throw new Error("That room is under maintenance.");
  if (capacityCheckRoom.occupied_beds >= capacityCheckRoom.capacity)
    throw new Error("That room is already full.");

  const body = {
    status: "active",
    joining_date: payload.joining_date || todayISO(),
    sharing_type: capacityCheckRoom.room_type,
    ...payload,
  };

  if (isConfigured) {
    const { data, error } = await supabase
      .from("students")
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    await recalcRoomOccupancySupabase(data.room_id);
    return data;
  }

  const created = mockDb.insert("students", body);
  mockDb.insert("room_history", {
    student_id: created.id,
    room_id: created.room_id,
    assigned_date: created.joining_date,
    vacated_date: null,
  });
  recomputeRoomMock(created.room_id);
  return created;
}

export async function updateStudent(id, patch) {
  if (isConfigured) {
    const { data: before, error: beforeErr } = await supabase
      .from("students")
      .select("room_id, status")
      .eq("id", id)
      .single();
    if (beforeErr) throw beforeErr;

    const { data, error } = await supabase
      .from("students")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    if (patch.room_id && patch.room_id !== before.room_id) {
      await recalcRoomOccupancySupabase(before.room_id);
      await recalcRoomOccupancySupabase(patch.room_id);
    } else if (patch.status && patch.status !== before.status) {
      await recalcRoomOccupancySupabase(data.room_id);
    }
    return data;
  }
  const before = mockDb.get("students").find((s) => s.id === id);
  const updated = mockDb.update("students", id, patch);
  if (before && patch.room_id && patch.room_id !== before.room_id) {
    recomputeRoomMock(before.room_id);
    recomputeRoomMock(patch.room_id);
  } else {
    recomputeRoomMock(updated.room_id);
  }
  return updated;
}

export async function vacateStudent(id, { vacated_date, vacated_reason }) {
  // Enforced here too (not just in the UI) so this rule holds no matter
  // where vacateStudent is called from.
  const existingPayments = await listPayments();
  const outstanding = existingPayments
    .filter((p) => p.student_id === id)
    .reduce((sum, p) => sum + Number(p.balance || 0), 0);
  if (outstanding > 0) {
    throw new Error(
      `This student has ₹${outstanding.toLocaleString("en-IN")} in pending payments. Collect it before vacating.`,
    );
  }

  const patch = {
    status: "vacated",
    vacated_date: vacated_date || todayISO(),
    vacated_reason,
  };
  if (isConfigured) {
    const { data, error } = await supabase
      .from("students")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await recalcRoomOccupancySupabase(data.room_id);
    return data;
  }
  const before = mockDb.get("students").find((s) => s.id === id);
  const updated = mockDb.update("students", id, patch);
  const history = mockDb
    .get("room_history")
    .map((h) =>
      h.student_id === id && !h.vacated_date
        ? { ...h, vacated_date: patch.vacated_date }
        : h,
    );
  mockDb.set("room_history", history);
  if (before) recomputeRoomMock(before.room_id);
  return updated;
}

// Permanent removal — distinct from vacateStudent, which intentionally
// preserves history. This is for correcting mistakes (e.g. a student added
// in error), not for normal move-outs. The UI always confirms before
// calling this. DB foreign keys (payments, room_history, documents) cascade
// on delete, so we only need to clean those up ourselves in demo mode.
export async function deleteStudent(id) {
  if (isConfigured) {
    const { data: existing, error: fetchErr } = await supabase
      .from("students")
      .select("room_id")
      .eq("id", id)
      .single();
    if (fetchErr) throw fetchErr;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) throw error;
    await recalcRoomOccupancySupabase(existing.room_id);
    return true;
  }
  const existing = mockDb.get("students").find((s) => s.id === id);
  mockDb.removeWhere("payments", (p) => p.student_id === id);
  mockDb.removeWhere("room_history", (h) => h.student_id === id);
  mockDb.removeWhere("documents", (d) => d.student_id === id);
  mockDb.remove("students", id);
  if (existing) recomputeRoomMock(existing.room_id);
  return true;
}

export async function getRoomHistory(studentId) {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("room_history")
      .select("*, rooms(room_number, floor)")
      .eq("student_id", studentId)
      .order("assigned_date", { ascending: false });
    if (error) throw error;
    return data;
  }
  const rooms = mockDb.get("rooms");
  return mockDb
    .get("room_history")
    .filter((h) => h.student_id === studentId)
    .map((h) => ({ ...h, rooms: rooms.find((r) => r.id === h.room_id) }))
    .sort((a, b) => new Date(b.assigned_date) - new Date(a.assigned_date));
}

/* ================================================================
   PAYMENTS
   ================================================================ */
function computePaymentFields(p) {
  const total =
    Number(p.room_rent || 0) +
    Number(p.bike_charge || 0) +
    Number(p.mess_charge || 0);
  const paid = Number(p.amount_paid || 0);
  return {
    total_amount: total,
    balance: total - paid,
    status: paid <= 0 ? "pending" : paid >= total ? "paid" : "partial",
  };
}

export async function listPayments({ month, status } = {}) {
  if (isConfigured) {
    let q = supabase
      .from("payments")
      .select("*, students(name, mobile, room_id, rooms(room_number))")
      .order("created_at", { ascending: false });
    if (month) q = q.eq("month_year", month);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  const students = mockDb.get("students");
  const rooms = mockDb.get("rooms");
  let rows = mockDb.get("payments");
  if (month) rows = rows.filter((p) => p.month_year === month);
  if (status) rows = rows.filter((p) => p.status === status);
  return rows
    .map((p) => {
      const s = students.find((st) => st.id === p.student_id);
      const room = s ? rooms.find((r) => r.id === s.room_id) : null;
      return {
        ...p,
        students: s
          ? { name: s.name, mobile: s.mobile, room_id: s.room_id, rooms: room }
          : null,
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function collectPayment(id, fields) {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("payments")
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const existing = mockDb.get("payments").find((p) => p.id === id);
  const merged = { ...existing, ...fields };
  const computed = computePaymentFields(merged);
  return mockDb.update("payments", id, { ...fields, ...computed });
}

export async function generateMonthlyPayments(month = monthStartISO()) {
  const settings = await getSettings();
  const students = await listStudents({ status: "active" });
  const existing = await listPayments({ month });
  const existingIds = new Set(existing.map((p) => p.student_id));
  let created = 0;

  for (const s of students) {
    if (existingIds.has(s.id)) continue;
    const rentKey = `${s.type}_rent_${s.sharing_type}`;
    const rent = Number(settings[rentKey] || 0);
    const bike = s.bike_available ? Number(settings.bike_charge || 0) : 0;
    // Mess charge is per-student: use the student's own mess_charge when
    // set, otherwise fall back to the hostel-wide default. Never apply one
    // shared value to every student.
    const mess = s.mess_available
      ? Number(s.mess_charge ?? settings.mess_default ?? 0)
      : 0;
    const base = {
      student_id: s.id,
      month_year: month,
      room_rent: rent,
      bike_charge: bike,
      mess_charge: mess,
      amount_paid: 0,
    };
    const computed = computePaymentFields(base);

    if (isConfigured) {
      const { error } = await supabase
        .from("payments")
        .insert({ ...base, ...computed });
      if (!error) created++;
    } else {
      mockDb.insert("payments", {
        ...base,
        ...computed,
        payment_method: null,
        transaction_number: "",
        payment_date: null,
        remarks: "",
      });
      created++;
    }
  }
  return created;
}

/* ================================================================
   WORKERS & SALARIES
   ================================================================ */
export async function listWorkers() {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("workers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }
  return [...mockDb.get("workers")].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );
}

export async function createWorker(payload) {
  const body = {
    status: "active",
    joining_date: payload.joining_date || todayISO(),
    ...payload,
  };
  if (isConfigured) {
    const { data, error } = await supabase
      .from("workers")
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return mockDb.insert("workers", body);
}

export async function updateWorker(id, patch) {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("workers")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return mockDb.update("workers", id, patch);
}

// Permanent removal, always confirmed in the UI first. DB foreign keys
// (worker_salaries, documents) cascade on delete; demo mode cleans those
// up manually since there's no real FK enforcement there.
export async function deleteWorker(id) {
  if (isConfigured) {
    const { error } = await supabase.from("workers").delete().eq("id", id);
    if (error) throw error;
    return true;
  }
  mockDb.removeWhere("worker_salaries", (s) => s.worker_id === id);
  mockDb.removeWhere("documents", (d) => d.worker_id === id);
  mockDb.remove("workers", id);
  return true;
}

function computeSalaryFields(s) {
  const final =
    Number(s.base_salary || 0) +
    Number(s.overtime || 0) +
    Number(s.bonus || 0) -
    Number(s.advance || 0) -
    Number(s.leave_deduction || 0);
  return { final_salary: final };
}

export async function listSalaries({ month } = {}) {
  if (isConfigured) {
    let q = supabase
      .from("worker_salaries")
      .select("*, workers(name, position)")
      .order("created_at", { ascending: false });
    if (month) q = q.eq("month_year", month);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  const workers = mockDb.get("workers");
  let rows = mockDb.get("worker_salaries");
  if (month) rows = rows.filter((r) => r.month_year === month);
  return rows.map((r) => {
    const w = workers.find((wk) => wk.id === r.worker_id);
    return { ...r, workers: w ? { name: w.name, position: w.position } : null };
  });
}

export async function upsertSalary(payload) {
  const computed = computeSalaryFields(payload);
  const full = { ...payload, ...computed };
  if (isConfigured) {
    const { data, error } = await supabase
      .from("worker_salaries")
      .upsert(full, { onConflict: "worker_id,month_year" })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const rows = mockDb.get("worker_salaries");
  const existing = rows.find(
    (r) =>
      r.worker_id === payload.worker_id && r.month_year === payload.month_year,
  );
  if (existing) return mockDb.update("worker_salaries", existing.id, full);
  return mockDb.insert("worker_salaries", full);
}

/* ================================================================
   EXPENSES
   ================================================================ */
export async function listExpenses() {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false });
    if (error) throw error;
    return data;
  }
  return [...mockDb.get("expenses")].sort(
    (a, b) => new Date(b.expense_date) - new Date(a.expense_date),
  );
}

export async function createExpense(payload) {
  const body = { expense_date: payload.expense_date || todayISO(), ...payload };
  if (isConfigured) {
    const { data, error } = await supabase
      .from("expenses")
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return mockDb.insert("expenses", body);
}

/* ================================================================
   SETTINGS
   ================================================================ */
export async function getSettings() {
  if (isConfigured) {
    const { data, error } = await supabase
      .from("hostel_settings")
      .select("key, value");
    if (error) throw error;
    return Object.fromEntries(data.map((r) => [r.key, r.value]));
  }
  return mockDb.getSettings();
}

export async function updateSettings(patch) {
  if (isConfigured) {
    const rows = Object.entries(patch).map(([key, value]) => ({
      key,
      value: String(value),
    }));
    const { error } = await supabase
      .from("hostel_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw error;
    return getSettings();
  }
  return mockDb.setSettings(patch);
}

export { todayISO, monthStartISO };
