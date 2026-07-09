const KEY = "pms_mock_db_v2";

function uid() {
  return (
    "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

function seed() {
  const rooms = [];
  let roomNo = { 1: 101, 2: 201, 3: 301 };
  [1, 2, 3].forEach((floor) => {
    for (let i = 0; i < 6; i++) {
      const type = i % 3 === 0 ? 3 : 2;
      rooms.push({
        id: uid(),
        floor,
        room_number: roomNo[floor]++,
        room_type: type,
        capacity: type,
        occupied_beds: 0,
        status: floor === 2 && i === 5 ? "maintenance" : "available",
        created_at: new Date().toISOString(),
      });
    }
  });

  const names = [
    "Arjun Kumar",
    "Priya Sharma",
    "Rahul Verma",
    "Meera Iyer",
    "Karthik R.",
    "Fathima N.",
    "Vignesh S.",
    "Divya Menon",
    "Suresh Babu",
    "Ananya Das",
    "Mohammed Faizal",
    "Lakshmi Narayan",
    "Kiran Reddy",
    "Nisha Patel",
  ];
  const students = [];
  names.forEach((name, i) => {
    const room = rooms[i % rooms.length];
    if (room.status === "maintenance") return;
    const cap = room.capacity;
    if (room.occupied_beds >= cap) return;
    const type = i % 6 === 0 ? "employee" : "student";
    const bike = i % 3 === 0;
    const mess = i % 2 === 0;
    // Independent per-student mess charge (varies student to student —
    // never a single shared default) so editing one never touches another.
    const messRates = [1500, 1800, 2000, 1650, 2200];
    const student = {
      id: uid(),
      name,
      mobile: "9" + (800000000 + i * 137).toString().slice(0, 9),
      alt_mobile: "",
      email: "",
      type,
      room_id: room.id,
      sharing_type: room.room_type,
      mess_available: mess,
      mess_charge: mess ? messRates[i % messRates.length] : 0,
      bike_available: bike,
      photo_url: "",
      aadhar_number: "XXXX-XXXX-" + (1000 + i),
      aadhar_front_url: "",
      aadhar_back_url: "",
      license_number: "",
      license_url: "",
      permanent_address: "Chennai, Tamil Nadu",
      current_address: "Chennai, Tamil Nadu",
      guardian_name: "Guardian of " + name.split(" ")[0],
      guardian_mobile: "9" + (700000000 + i * 91).toString().slice(0, 9),
      joining_date: new Date(Date.now() - i * 20 * 86400000)
        .toISOString()
        .slice(0, 10),
      status: i === 3 ? "vacated" : "active",
      vacated_date: i === 3 ? new Date().toISOString().slice(0, 10) : null,
      vacated_reason: i === 3 ? "Completed course, relocating" : null,
      remarks: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    students.push(student);
    if (student.status === "active") room.occupied_beds++;
  });
  rooms.forEach((r) => {
    if (r.status !== "maintenance")
      r.status = r.occupied_beds >= r.capacity ? "full" : "available";
  });

  const settings = {
    hostel_name: "Malabar Muslim Association",
    owner_name: "Alavudeen",
    address: "12 Anna Nagar Main Road, Chennai, Tamil Nadu",
    phone: "9876543210",
    student_rent_2: "4350",
    student_rent_3: "3850",
    employee_rent_2: "5350",
    employee_rent_3: "4850",
    bike_charge: "250",
    mess_default: "1800",
  };

  const monthStart = new Date();
  const monthStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

  const payments = students
    .filter((s) => s.status === "active")
    .map((s, i) => {
      const rentKey = `${s.type}_rent_${s.sharing_type}`;
      const rent = Number(settings[rentKey] || 4000);
      const bike = s.bike_available ? Number(settings.bike_charge) : 0;
      // Per-student mess charge — falls back to the hostel default only
      // when this particular student doesn't have one of their own set.
      const mess = s.mess_available
        ? Number(s.mess_charge ?? settings.mess_default)
        : 0;
      const total = rent + bike + mess;
      const paidRoll = i % 4;
      const paid =
        paidRoll === 0 ? total : paidRoll === 1 ? Math.round(total * 0.5) : 0;
      return {
        id: uid(),
        student_id: s.id,
        month_year: monthStr,
        room_rent: rent,
        bike_charge: bike,
        mess_charge: mess,
        total_amount: total,
        amount_paid: paid,
        balance: total - paid,
        status: paid >= total ? "paid" : paid > 0 ? "partial" : "pending",
        payment_method: paid > 0 ? "GPay" : null,
        transaction_number: paid > 0 ? "TXN" + (100000 + i) : "",
        payment_date: paid > 0 ? new Date().toISOString().slice(0, 10) : null,
        remarks: "",
        created_at: new Date().toISOString(),
      };
    });

  const workers = [
    {
      id: uid(),
      name: "Suresh Kumar",
      mobile: "9123456780",
      alt_mobile: "",
      email: "",
      position: "Watchman",
      salary: 12000,
      photo_url: "",
      aadhar_number: "XXXX-1111",
      aadhar_url: "",
      permanent_address: "Chennai",
      current_address: "Chennai",
      joining_date: "2024-01-10",
      status: "active",
      created_at: new Date().toISOString(),
    },
    {
      id: uid(),
      name: "Lakshmi Devi",
      mobile: "9123456781",
      alt_mobile: "",
      email: "",
      position: "Cook",
      salary: 15000,
      photo_url: "",
      aadhar_number: "XXXX-2222",
      aadhar_url: "",
      permanent_address: "Chennai",
      current_address: "Chennai",
      joining_date: "2023-11-01",
      status: "active",
      created_at: new Date().toISOString(),
    },
    {
      id: uid(),
      name: "Ravi Shankar",
      mobile: "9123456782",
      alt_mobile: "",
      email: "",
      position: "Cleaner",
      salary: 9000,
      photo_url: "",
      aadhar_number: "XXXX-3333",
      aadhar_url: "",
      permanent_address: "Chennai",
      current_address: "Chennai",
      joining_date: "2024-03-15",
      status: "active",
      created_at: new Date().toISOString(),
    },
  ];

  const workerSalaries = workers.map((w, i) => {
    const base = w.salary;
    const advance = i === 0 ? 2000 : 0;
    const overtime = i === 1 ? 800 : 0;
    const bonus = 0;
    const leaveTaken = i === 2 ? 1 : 0;
    const leaveDeduction = leaveTaken * Math.round(base / 30);
    const final = base + overtime + bonus - advance - leaveDeduction;
    return {
      id: uid(),
      worker_id: w.id,
      month_year: monthStr,
      base_salary: base,
      advance,
      overtime,
      bonus,
      leave_taken: leaveTaken,
      leave_deduction: leaveDeduction,
      final_salary: final,
      status: i === 1 ? "paid" : "pending",
      payment_method: i === 1 ? "Cash" : "",
      payment_date: i === 1 ? new Date().toISOString().slice(0, 10) : null,
      remarks: "",
      created_at: new Date().toISOString(),
    };
  });

  const expenses = [
    {
      id: uid(),
      name: "July electricity bill",
      category: "Electricity",
      amount: 8200,
      expense_date: new Date().toISOString().slice(0, 10),
      paid_to: "TNEB",
      payment_method: "UPI",
      bill_url: "",
      remarks: "",
    },
    {
      id: uid(),
      name: "Drinking water cans",
      category: "Water",
      amount: 1400,
      expense_date: new Date(Date.now() - 3 * 86400000)
        .toISOString()
        .slice(0, 10),
      paid_to: "Aqua Suppliers",
      payment_method: "Cash",
      bill_url: "",
      remarks: "",
    },
    {
      id: uid(),
      name: "Broadband renewal",
      category: "Internet",
      amount: 1999,
      expense_date: new Date(Date.now() - 6 * 86400000)
        .toISOString()
        .slice(0, 10),
      paid_to: "ACT Fibernet",
      payment_method: "Bank Transfer",
      bill_url: "",
      remarks: "",
    },
    {
      id: uid(),
      name: "Kitchen gas refill",
      category: "Gas",
      amount: 1150,
      expense_date: new Date(Date.now() - 10 * 86400000)
        .toISOString()
        .slice(0, 10),
      paid_to: "Bharat Gas",
      payment_method: "Cash",
      bill_url: "",
      remarks: "",
    },
    {
      id: uid(),
      name: "Ceiling fan repair, Room 204",
      category: "Repair",
      amount: 650,
      expense_date: new Date(Date.now() - 14 * 86400000)
        .toISOString()
        .slice(0, 10),
      paid_to: "Local electrician",
      payment_method: "Cash",
      bill_url: "",
      remarks: "",
    },
    {
      id: uid(),
      name: "Groceries for mess",
      category: "Food",
      amount: 12800,
      expense_date: new Date(Date.now() - 18 * 86400000)
        .toISOString()
        .slice(0, 10),
      paid_to: "Nilgiris",
      payment_method: "GPay",
      bill_url: "",
      remarks: "",
    },
  ].map((e) => ({ ...e, created_at: new Date().toISOString() }));

  return {
    rooms,
    students,
    room_history: [],
    payments,
    workers,
    worker_salaries: workerSalaries,
    expenses,
    settings,
    documents: [],
  };
}

function load() {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through to reseed */
    }
  }
  const fresh = seed();
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export const mockDb = {
  get(table) {
    return load()[table] || [];
  },
  set(table, rows) {
    const db = load();
    db[table] = rows;
    save(db);
  },
  insert(table, row) {
    const db = load();
    const withId = { id: uid(), created_at: new Date().toISOString(), ...row };
    db[table] = [...(db[table] || []), withId];
    save(db);
    return withId;
  },
  update(table, id, patch) {
    const db = load();
    let updated = null;
    db[table] = (db[table] || []).map((r) => {
      if (r.id === id) {
        updated = { ...r, ...patch };
        return updated;
      }
      return r;
    });
    save(db);
    return updated;
  },
  getSettings() {
    return load().settings;
  },
  setSettings(patch) {
    const db = load();
    db.settings = { ...db.settings, ...patch };
    save(db);
    return db.settings;
  },
  reset() {
    localStorage.removeItem(KEY);
    return load();
  },
};
