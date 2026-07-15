import { initTheme } from "./theme.js";
import { requireSession } from "./auth.js";
import { renderShell } from "./shell.js";
import { getSettings, updateSettings } from "./db.js";
import { toast } from "./toast.js";
import { qs } from "./utils.js";

initTheme();
await requireSession();
renderShell("settings");

const FIELD_MAP = {
  "s-name": "hostel_name",
  "s-owner": "owner_name",
  "s-phone": "phone",
  "s-address": "address",
  "s-student2": "student_rent_2",
  "s-student3": "student_rent_3",
  "s-emp2": "employee_rent_2",
  "s-emp3": "employee_rent_3",
  "s-bike": "bike_charge",
  "s-mess": "mess_default",
};

async function load() {
  const settings = await getSettings();
  Object.entries(FIELD_MAP).forEach(([id, key]) => {
    const el = qs(`#${id}`);
    if (el) el.value = settings[key] ?? "";
  });
}

qs("#save-settings-btn").addEventListener("click", async () => {
  const btn = qs("#save-settings-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  const patch = {};
  Object.entries(FIELD_MAP).forEach(([id, key]) => {
    const el = qs(`#${id}`);
    patch[key] = el ? el.value : "";
  });
  try {
    await updateSettings(patch);
    toast("Settings saved.");
  } catch (err) {
    toast(err.message || "Could not save settings.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save settings";
  }
});

load();
