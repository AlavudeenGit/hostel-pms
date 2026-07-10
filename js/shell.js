import { toggleTheme, syncThemeIcon } from "./theme.js";
import { signOut } from "./auth.js";

const NAV = [
  {
    group: "Overview",
    items: [
      {
        key: "dashboard",
        href: "index.html",
        label: "Dashboard",
        icon: `<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="12" width="8" height="9" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>`,
      },
    ],
  },
  {
    group: "Manage",
    items: [
      {
        key: "rooms",
        href: "rooms.html",
        label: "Rooms",
        icon: `<path d="M4 21V9.5L12 4l8 5.5V21"/><path d="M9 21v-7h6v7"/>`,
      },
      {
        key: "students",
        href: "students.html",
        label: "Students & Employees",
        icon: `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6"/><circle cx="17.5" cy="8.5" r="2.4"/><path d="M15.5 14.6c2.6.4 4.5 2.4 4.5 5.4"/>`,
      },
      {
        key: "workers",
        href: "workers.html",
        label: "Workers",
        icon: `<rect x="3" y="7" width="18" height="13" rx="1.8"/><path d="M8 7V5.5A2 2 0 0 1 10 3.5h4A2 2 0 0 1 16 5.5V7"/>`,
      },
      {
        key: "payments",
        href: "payments.html",
        label: "Payments",
        icon: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.5h18"/><path d="M7 14h4"/>`,
      },
      {
        key: "expenses",
        href: "expenses.html",
        label: "Expenses",
        icon: `<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4"/>`,
      },
    ],
  },
  {
    group: "Insights",
    items: [
      {
        key: "reports",
        href: "reports.html",
        label: "Reports",
        icon: `<path d="M4 20V10M11 20V4M18 20v-7"/>`,
      },
      {
        key: "settings",
        href: "settings.html",
        label: "Settings",
        icon: `<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.7a7 7 0 0 0-2-1.2L14 2h-4l-.5 2.3a7 7 0 0 0-2 1.2l-2.4-.7-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.7c.6.5 1.3.9 2 1.2L10 22h4l.5-2.3c.7-.3 1.4-.7 2-1.2l2.4.7 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"/>`,
      },
    ],
  },
];

export function renderShell(
  activeKey,
  { searchPlaceholder = "Search name, room, mobile, Aadhar…" } = {},
) {
  const sidebar = document.getElementById("sidebar");
  const topbar = document.getElementById("topbar");
  if (!sidebar || !topbar) return;

  sidebar.innerHTML = `
    <div class="brand">
       <img
          src="asset/images/MMA_LOGO.png"
          alt="MMA Logo"
          class="brand-mark-lg"
        />
      <div class="brand-text">
        <div class="name">Malabar Muslim Association</div>
        <div class="sub">Register &amp; Ledger</div>
      </div>
    </div>
    ${NAV.map(
      (g) => `
      <div class="nav-group-label">${g.group}</div>
      <nav class="nav">
        ${g.items
          .map(
            (it) => `
          <a class="nav-item ${it.key === activeKey ? "active" : ""}" href="${it.href}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${it.icon}</svg>
            ${it.label}
          </a>
        `,
          )
          .join("")}
      </nav>
    `,
    ).join("")}
    <div class="sidebar-foot">
      <div class="admin-chip">
        <div class="admin-avatar">A</div>
        <div class="admin-meta">
          <div class="who">Admin</div>
          <div class="role">Alavudeen - 9360302955</div>
        </div>
      </div>
    </div>
  `;

  topbar.innerHTML = `
    <button class="icon-btn" id="menu-toggle" aria-label="Toggle menu">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <div class="search-box">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-3.8-3.8"/></svg>
      <input type="text" id="global-search" placeholder="${searchPlaceholder}" />
    </div>
    <div class="topbar-actions">
      <button class="icon-btn" id="theme-toggle" aria-label="Toggle dark mode"><span data-theme-icon></span></button>
      <button class="icon-btn" aria-label="Notifications">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>
      </button>
      <button class="icon-btn" id="logout-btn" aria-label="Log out">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
      </button>
    </div>
  `;

  document
    .getElementById("theme-toggle")
    .addEventListener("click", toggleTheme);
  document.getElementById("logout-btn").addEventListener("click", signOut);
  syncThemeIcon();

  // ---- Mobile menu: hamburger + backdrop (hamburger only shows <880px) ----
  let backdrop = document.getElementById("sidebar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "sidebar-backdrop";
    backdrop.className = "sidebar-backdrop";
    document.body.appendChild(backdrop);
  }

  function openMobileNav() {
    sidebar.classList.add("open");
    backdrop.classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function closeMobileNav() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    document.body.style.overflow = "";
  }

  document.getElementById("menu-toggle").addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeMobileNav() : openMobileNav();
  });
  backdrop.addEventListener("click", closeMobileNav);
  sidebar
    .querySelectorAll(".nav-item")
    .forEach((link) => link.addEventListener("click", closeMobileNav));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileNav();
  });
}
