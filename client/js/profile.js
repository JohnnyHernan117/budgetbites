(function () {
  const API_BASE = "https://budgetbites-api.onrender.com/api";

  const msg = (id, text, ok = true) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = "form-message" + (ok ? " success" : " error");
    setTimeout(() => {
      el.textContent = "";
      el.className = "form-message";
    }, 2500);
  };

  function authHeaders(extra = {}) {
    const token = localStorage.getItem("bb_token");
    return {
      ...extra,
      Authorization: `Bearer ${token}`
    };
  }

  const nameInput = document.getElementById("profileName");
  const emailInput = document.getElementById("profileEmail");

  function loadProfileFields() {
    const storedName = (localStorage.getItem("bb_user") || "").trim();
    const storedEmail = (localStorage.getItem("bb_user_email") || "").trim();

    if (nameInput) nameInput.value = storedName;
    if (emailInput) emailInput.value = storedEmail;
  }

  document.getElementById("saveProfileBtn")?.addEventListener("click", () => {
    const nextName = (nameInput?.value || "").trim();

    if (!nextName) {
      msg("profileMsg", "Display name cannot be empty.", false);
      return;
    }

    localStorage.setItem("bb_user", nextName);
    msg("profileMsg", "Display name updated on this device.", true);
  });

  document.getElementById("resetDemoBtn")?.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Reset demo data? This will clear pantry, budget, expenses, favorites, and Chef suggestions."
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/reset-demo`, {
        method: "POST",
        headers: authHeaders()
      });

      if (!res.ok) throw new Error("Reset failed");

      localStorage.removeItem("bb.chef.lastPicks.v1");
      localStorage.removeItem("bb.lastCooked.v1");
      localStorage.removeItem("bb.budget.chartMode.v1");

      msg("profileMsg", "Demo data reset.", true);

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 800);
    } catch (err) {
      console.error(err);
      msg("profileMsg", "Could not reset demo data.", false);
    }
  });

  loadProfileFields();
})();