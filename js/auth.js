import { supabase, isConfigured } from "./supabaseClient.js";
import { qs } from "./utils.js";

const DEMO_FLAG = "pms_demo_session";

export function initLoginPage() {
  const form = qs("#login-form");
  const errorBox = qs("#login-error");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.remove("show");
    const email = qs("#login-email").value.trim();
    const password = qs("#login-password").value;
    const btn = qs("#login-submit");
    btn.disabled = true;
    btn.textContent = "Signing in…";

    try {
      if (isConfigured) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        // Demo mode: no Supabase project wired up yet — accept any
        // non-empty credentials so the dashboard can be reviewed.
        if (!email || !password)
          throw new Error("Enter your admin email and password.");
        sessionStorage.setItem(DEMO_FLAG, "1");
      }
      window.location.href = "index.html";
    } catch (err) {
      errorBox.textContent =
        err.message || "Could not sign in. Check your credentials.";
      errorBox.classList.add("show");
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  });
}

export async function requireSession() {
  if (isConfigured) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) window.location.href = "login.html";
    return data.session;
  }
  // Demo mode guard
  if (!sessionStorage.getItem(DEMO_FLAG)) {
    window.location.href = "login.html";
  }
  return null;
}

export async function signOut() {
  if (isConfigured) {
    await supabase.auth.signOut();
  } else {
    sessionStorage.removeItem(DEMO_FLAG);
  }
  window.location.href = "login.html";
}
