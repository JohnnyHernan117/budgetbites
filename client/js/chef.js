(function () {
  const LS = {
    lastPicks: "bb.chef.lastPicks.v1",
  };

  const $ = (id) => document.getElementById(id);
  const API_BASE = "https://budgetbites-api.onrender.com/api";

  function authHeaders(extra = {}) {
    const token = localStorage.getItem("bb_token");
    return {
      ...extra,
      Authorization: `Bearer ${token}`
    };
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function fetchPantryItems() {
    try {
      const res = await fetch(`${API_BASE}/pantry`, {
        headers: authHeaders()
      });

      if (!res.ok) throw new Error("Failed to load pantry");

      const data = await res.json();

      // return just names (what your API expects)
      return Array.isArray(data)
        ? data.map(item => item.name).filter(Boolean)
        : [];
    } catch (err) {
      console.error("Pantry fetch error:", err);
      return [];
    }
  }
    async function fetchChefSuggestions(payload) {
        const res = await fetch(`${API_BASE}/chef`, {     
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Chef request failed.");
    }

    return res.json();
  }

  const promptInput = $("chefPrompt");
  const chefMsg = $("chefMsg");
  const statusText = $("chefStatusText");

  const budgetPerServing = $("budgetPerServing");
  const maxMinutes = $("maxMinutes");
  const pantryOnly = $("pantryOnly");
  const diet = $("diet");

  const optionEls = [
    {
      meta: $("opt1Meta"),
      name: $("opt1Name"),
      text: $("opt1Text"),
      saveBtn: $("saveOpt1"),
      cookBtn: $("cookOpt1"),
    },
    {
      meta: $("opt2Meta"),
      name: $("opt2Name"),
      text: $("opt2Text"),
      saveBtn: $("saveOpt2"),
      cookBtn: $("cookOpt2"),
    },
    {
      meta: $("opt3Meta"),
      name: $("opt3Name"),
      text: $("opt3Text"),
      saveBtn: $("saveOpt3"),
      cookBtn: $("cookOpt3"),
    },
  ];

  let currentPicks = readJSON(LS.lastPicks, []);

  function showMsg(text, ok = true) {
    if (!chefMsg) return;
    chefMsg.textContent = text;
    chefMsg.className = "form-message" + (ok ? " success" : " error");
    setTimeout(() => {
      chefMsg.textContent = "";
      chefMsg.className = "form-message";
    }, 2500);
  }

  function setStatus(text) {
    if (statusText) statusText.textContent = text;
  }

  function setGenerating(isGenerating) {
    const btn = $("chefGoBtn");
    if (!btn) return;

    btn.disabled = isGenerating;

    const span = btn.querySelector("span");
    if (span) {
      span.textContent = isGenerating ? "Generating..." : "options";
    } else {
      btn.textContent = isGenerating ? "Generating..." : "options";
    }
  }

  function renderConstraintSummary() {
    const el = $("activeConstraints");
    if (!el) return;

    const parts = [];

    const maxCost = parseFloat(budgetPerServing?.value || "");
    const maxTime = parseInt(maxMinutes?.value || "", 10);
    const wantPantryOnly = (pantryOnly?.value || "no") === "yes";
    const dietVal = diet?.value || "any";

    if (!Number.isNaN(maxCost)) parts.push(`under $${maxCost.toFixed(2)}/serving`);
    if (!Number.isNaN(maxTime)) parts.push(`under ${maxTime} min`);
    if (wantPantryOnly) parts.push("pantry only");
    if (dietVal !== "any") parts.push(dietVal);

    el.textContent = parts.length
      ? `Active filters: ${parts.join(" • ")}`
      : "No active constraints.";
  }

  function clearOptions() {
    optionEls.forEach((o) => {
      o.meta.textContent = "—";
      o.name.textContent = "—";
      o.text.textContent = "Run a prompt to see results.";
    });
  }

  function recipeFitsPantry(r, pset) {
    const ings = (r.ingredients || []).map((x) => String(x).toLowerCase());
    if (!ings.length) return true;

    return ings.every((ing) => {
      const tokens = ing.split(/\s+/).filter(Boolean);
      for (const p of pset) {
        if (p.includes(ing)) return true;
        if (tokens.some((t) => t.length >= 3 && p.includes(t))) return true;
      }
      return false;
    });
  }

  async function saveFavorite(recipe) {
    const payload = {
      id: recipe.id || recipe.name,
      name: recipe.name,
      minutes: recipe.minutes,
      costPerServing: recipe.costPerServing,
      description: `Ingredients: ${(recipe.ingredients || []).slice(0, 4).join(", ")}`,
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : [],
      substitutions: Array.isArray(recipe.substitutions) ? recipe.substitutions : [],
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
      savedAt: new Date().toISOString(),
      cookedCount: 0
    };

    try {
      const res = await fetch(`${API_BASE}/favorites`, {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
      });

      if (res.status === 409) {
        showMsg("Already saved to Favorites.", true);
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to save favorite");
      }

      showMsg("Saved to Favorites!", true);
    } catch (err) {
      console.error(err);
      showMsg("Could not save favorite.", false);
    }
  }

  async function cookRecipe(recipe) {
    const lastCooked = {
      id: recipe.id || recipe.name,
      name: recipe.name,
      cookedAt: new Date().toISOString(),
    };

    localStorage.setItem("bb.lastCooked.v1", JSON.stringify(lastCooked));

    try {
      const res = await fetch(`${API_BASE}/favorites/${encodeURIComponent(recipe.id || recipe.name)}/cook`, {
        method: "PATCH",
        headers: authHeaders()
      });

      if (res.status === 404) {
        await saveFavorite(recipe);

        const retry = await fetch(`${API_BASE}/favorites/${encodeURIComponent(recipe.id || recipe.name)}/cook`, {
          method: "PATCH",
          headers: authHeaders()
        });

        if (!retry.ok) throw new Error("Cook update failed after save");
      } else if (!res.ok) {
        throw new Error("Cook update failed");
      }

      showMsg(`Cooking: ${recipe.name}`, true);
    } catch (err) {
      console.error(err);
      showMsg("Could not update cook count.", false);
    }
  }

  function renderPicks(picks) {
  currentPicks = picks;
  writeJSON(LS.lastPicks, currentPicks);

  optionEls.forEach((o, idx) => {
    const r = picks[idx];
    if (!o) return;

    if (!r) {
      o.meta.textContent = "—";
      o.name.textContent = "—";
      o.text.innerHTML = "Run a prompt to see results.";
      return;
    }

    const cost = Number(r.costPerServing || 0);
    const mins = Number(r.minutes || 0);
    const ing = (r.ingredients || []).slice(0, 4);
    const sub = (r.substitutions || []).slice(0, 2);

    o.meta.textContent = `$${cost.toFixed(2)}/serving • ${mins} min`;
    o.name.textContent = r.name || "Untitled option";

    o.text.innerHTML = `
      <div><strong>Ingredients:</strong> ${ing.length ? ing.join(", ") : "—"}</div>
      <div style="margin-top:6px;"><strong>Substitutions:</strong> ${sub.length ? sub.join(", ") : "—"}</div>
    `;
  });
}

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const p = chip.getAttribute("data-p") || "";
      if (promptInput) promptInput.value = p;
    });
  });

  $("chefGoBtn")?.addEventListener("click", async () => {
    const userPrompt = (promptInput?.value || "").trim();
    const recipes = window.DEMO?.recipes || [];

    if (!userPrompt) {
      showMsg("Type a request or click a quick chip.", false);
      return;
    }

    const maxCost = parseFloat(budgetPerServing?.value || "");
    const maxTime = parseInt(maxMinutes?.value || "", 10);
    const wantPantryOnly = (pantryOnly?.value || "no") === "yes";
    const dietVal = diet?.value || "any";
    function clearMsg() {
      if (!chefMsg) return;
      chefMsg.textContent = "";
      chefMsg.className = "form-message";
    }
    renderConstraintSummary();
    clearMsg();
    setGenerating(true);

    try {
      setStatus("Generating with AI...");
      const pantryItems = wantPantryOnly ? await fetchPantryItems() : [];

      const payload = {
        prompt: userPrompt,
        budgetPerServing: Number.isNaN(maxCost) ? null : maxCost,
        maxMinutes: Number.isNaN(maxTime) ? null : maxTime,
        pantryOnly: wantPantryOnly,
        diet: dietVal,
        pantryItems,
      };

      const data = await fetchChefSuggestions(payload);

      if (!data?.recipes || !Array.isArray(data.recipes) || !data.recipes.length) {
        throw new Error("No AI recipes returned.");
      }

      renderPicks(data.recipes.slice(0, 3));
      showMsg("Generated 3 AI options.", true);
      setStatus("AI ready");
      return;
    } catch (err) {
      console.warn("AI failed, using fallback:", err);
      setStatus("Using fallback (demo)");
    } finally {
      setGenerating(false);
    }

    if (!recipes.length) {
      showMsg("No fallback recipes available.", false);
      return;
    }

    let filtered = recipes.slice();

    if (!Number.isNaN(maxCost)) {
      filtered = filtered.filter((r) => r.costPerServing <= maxCost);
    }
    if (!Number.isNaN(maxTime)) {
      filtered = filtered.filter((r) => r.minutes <= maxTime);
    }
    if (dietVal !== "any") {
      filtered = filtered.filter((r) => (r.tags || []).includes(dietVal));
    }
    if (wantPantryOnly) {
      const pantryItems = await fetchPantryItems();
      const pset = new Set(pantryItems.map((x) => String(x).toLowerCase()));
      filtered = filtered.filter((r) => recipeFitsPantry(r, pset));
    }

    const pool = filtered.length ? filtered : recipes;
    const picks = pool.slice(0, 3);

    while (picks.length < 3 && pool.length) {
      picks.push(pool[picks.length % pool.length]);
    }

    renderPicks(picks);
    showMsg("Generated 3 fallback options.", true);
  });

  $("chefClearBtn")?.addEventListener("click", () => {
    if (promptInput) promptInput.value = "";
    if (budgetPerServing) budgetPerServing.value = "";
    if (maxMinutes) maxMinutes.value = "";
    if (pantryOnly) pantryOnly.value = "no";
    if (diet) diet.value = "any";

    setStatus("Fallback ready");
    currentPicks = [];
    writeJSON(LS.lastPicks, currentPicks);
    clearOptions();
    renderConstraintSummary();
    showMsg("Cleared.", true);
  });

  optionEls.forEach((o, idx) => {
    o.saveBtn?.addEventListener("click", () => {
      const r = currentPicks[idx];
      if (!r) {
        showMsg("Run Chef first to generate options.", false);
        return;
      }
      saveFavorite(r);
    });

    o.cookBtn?.addEventListener("click", () => {
      const r = currentPicks[idx];
      if (!r) {
        showMsg("Run Chef first to generate options.", false);
        return;
      }
      cookRecipe(r);
    });
  });

  async function checkPrice() {
    const ingredient = document.getElementById("ingredientSearch").value;

    const res = await fetch(
      `https://budgetbites-api.onrender.com/api/ingredient-price?name=${ingredient}`
    );

    const data = await res.json();

    const resultsDiv = document.getElementById("priceResults");
    resultsDiv.innerHTML = "";
    
    data.forEach(item => {
      resultsDiv.innerHTML += `
        <div>
          <img src="${item.image}" width="60">
          <p>${item.name}</p>
          <p>Price: ${item.price}</p>
        </div>
      `;
    });
  }

  setStatus("Fallback ready");
  renderConstraintSummary();

  if (Array.isArray(currentPicks) && currentPicks.length) {
    renderPicks(currentPicks.slice(0, 3));
  } else {
    clearOptions();
  }
})();