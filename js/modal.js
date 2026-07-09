let overlayEl, panelOverlayEl;

export function openModal({
  title,
  sub = "",
  bodyHTML,
  footHTML = "",
  wide = false,
  onMount,
}) {
  closeModal();
  overlayEl = document.createElement("div");
  overlayEl.className = "modal-overlay";
  overlayEl.innerHTML = `
    <div class="modal-dialog ${wide ? "wide" : ""}">
      <div class="modal-head">
        <div>
          <h3>${title}</h3>
          ${sub ? `<div class="modal-sub">${sub}</div>` : ""}
        </div>
        <button class="modal-close" data-close-modal aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${footHTML ? `<div class="modal-foot">${footHTML}</div>` : ""}
    </div>
  `;
  document.body.appendChild(overlayEl);
  requestAnimationFrame(() => overlayEl.classList.add("show"));

  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl || e.target.closest("[data-close-modal]"))
      closeModal();
  });
  document.addEventListener("keydown", escHandler);

  if (onMount) onMount(overlayEl);
  return overlayEl;
}

export function closeModal() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    document.removeEventListener("keydown", escHandler);
  }
}

function escHandler(e) {
  if (e.key === "Escape") closeModal();
}

export function confirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger = true,
  onConfirm,
}) {
  const el = openModal({
    title,
    bodyHTML: `
      <div class="confirm-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 21.5 20h-19L12 3.5Z"/><path d="M12 10v4M12 16.5v.01"/></svg>
      </div>
      <p style="color:var(--ink-soft); font-size:13.5px; line-height:1.6;">${message}</p>
    `,
    footHTML: `
      <button class="btn btn-ghost" data-close-modal>Cancel</button>
      <button class="btn ${danger ? "btn-primary" : "btn-brass"}" id="confirm-ok">${confirmLabel}</button>
    `,
  });
  el.querySelector("#confirm-ok").addEventListener("click", async () => {
    await onConfirm();
    closeModal();
  });
}

/* ---------------- Slide-over panel ---------------- */
export function openSlideover({ title, sub = "", bodyHTML, onMount }) {
  closeSlideover();
  panelOverlayEl = document.createElement("div");
  panelOverlayEl.className = "slideover-overlay";
  panelOverlayEl.innerHTML = `
    <div class="slideover-panel">
      <div class="so-head">
        <div>
          <h3>${title}</h3>
          ${sub ? `<div class="modal-sub">${sub}</div>` : ""}
        </div>
        <button class="modal-close" data-close-slideover aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      ${bodyHTML}
    </div>
  `;
  document.body.appendChild(panelOverlayEl);
  requestAnimationFrame(() => panelOverlayEl.classList.add("show"));
  panelOverlayEl.addEventListener("click", (e) => {
    if (
      e.target === panelOverlayEl ||
      e.target.closest("[data-close-slideover]")
    )
      closeSlideover();
  });
  if (onMount) onMount(panelOverlayEl);
  return panelOverlayEl;
}

export function closeSlideover() {
  if (panelOverlayEl) {
    panelOverlayEl.remove();
    panelOverlayEl = null;
  }
}
