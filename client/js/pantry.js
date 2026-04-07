(function () {
  const API_BASE = "http://localhost:3000/api";
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function authHeaders(extra = {}) {
    const token = localStorage.getItem("bb_token");
    return {
      ...extra,
      Authorization: `Bearer ${token}`
    };
  }

  function msg(text, ok = true) {
    const el = $("pantryMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "form-message" + (ok ? " success" : " error");
    setTimeout(() => {
      el.textContent = "";
      el.className = "form-message";
    }, 2500);
  }

  let pantry = [];

  const nameEl = $("itemName");
  const qtyEl = $("itemQty");
  const searchEl = $("searchPantry");
  const tableBody = $("pantryTable");

  let activeTag = "";

  function matchesFilter(item) {
    const q = (searchEl?.value || "").trim().toLowerCase();
    if (q) {
      const hay = `${item.name || ""} ${item.qty || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function render() {
    if (!tableBody) return;
    const rows = pantry.filter(matchesFilter);

    if (!rows.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="3" class="muted">No matching items.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = rows
      .map(
        (it) => `
        <tr data-id="${esc(it.id)}">
          <td>${esc(it.name)}</td>
          <td>${esc(it.qty)}</td>
          <td style="text-align:right;">
            <button class="btn small" type="button" data-action="remove" data-id="${esc(it.id)}"><span>Remove</span></button>
          </td>
        </tr>
      `
      )
      .join("");
  }

  async function loadPantry() {
    try {
      const res = await fetch(`${API_BASE}/pantry`, {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error("Failed to load pantry");
      pantry = await res.json();
      render();
    } catch (err) {
      console.error(err);
      msg("Could not load pantry.", false);
    }
  }

  async function addItem() {
    const name = (nameEl?.value || "").trim();
    const qty = (qtyEl?.value || "").trim();

    if (!name) {
      msg("Enter an item name.", false);
      return;
    }

    const payload = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      name,
      qty
    };

    try {
      const res = await fetch(`${API_BASE}/pantry`, {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
      });

      if (res.status === 409) {
        msg("Item already exists.", false);
        return;
      }

      if (!res.ok) throw new Error("Failed to add pantry item");

      const created = await res.json();
      pantry.unshift(created);
      render();

      if (nameEl) nameEl.value = "";
      if (qtyEl) qtyEl.value = "";
      msg("Added to pantry.", true);
    } catch (err) {
      console.error(err);
      msg("Could not add pantry item.", false);
    }
  }

  $("addItemBtn")?.addEventListener("click", addItem);

  [nameEl, qtyEl].filter(Boolean).forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addItem();
    });
  });

  searchEl?.addEventListener("input", () => render());

  tableBody?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-action]");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    if (!id) return;

    try {
      const res = await fetch(`${API_BASE}/pantry/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders()
      });

      if (!res.ok) throw new Error("Failed to delete pantry item");

      pantry = pantry.filter((p) => p.id !== id);
      render();
      msg("Removed.", true);
    } catch (err) {
      console.error(err);
      msg("Could not remove pantry item.", false);
    }
  });

  const tagHandlers = {
    tagProtein: "Protein",
    tagGrain: "Grains",
    tagVeg: "Veggies",
    tagOther: "Other",
  };

  Object.entries(tagHandlers).forEach(([id, label]) => {
    $(id)?.addEventListener("click", () => {
      activeTag = label.toLowerCase();
      msg(`Filter: ${label} (tagging is a stretch feature).`, true);
      render();
    });
  });

  loadPantry();
})();