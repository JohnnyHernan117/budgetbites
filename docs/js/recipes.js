(function () {
  const FAVORITES_KEY = "bb.favorites.v1";

  const filterBtn = document.getElementById("applyFiltersBtn");
  const filterMsg = document.getElementById("filterMsg");
  const cardsContainer = document.querySelector(".cards-3");

  const costInput = document.querySelector('input[type="number"][placeholder*="2.00"]');
  const timeInput = document.querySelector('input[type="number"][placeholder*="20"]');
  const selects = document.querySelectorAll(".select");
  const dietSelect = selects[0];
  const pantryOnlySelect = selects[1];
  const API_BASE = "https://budgetbites-api.onrender.com/api";  let pantryNames = [];

  async function loadPantryNames() {
    try {
      const res = await fetch(`${API_BASE}/pantry`, {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error("Failed to load pantry");
      const items = await res.json();

      pantryNames = Array.isArray(items)
        ? items.map((i) => String(i?.name || "").trim().toLowerCase()).filter(Boolean)
        : [];
    } catch (err) {
      console.error("Failed to load pantry for recipes:", err);
      pantryNames = [];
    }
  }

  function authHeaders(extra = {}) {
    const token = localStorage.getItem("bb_token");
    return {
      ...extra,
      Authorization: `Bearer ${token}`
    };
  }

  function ingredientInPantry(ingredient) {
    const ing = String(ingredient || "").toLowerCase().trim();
    if (!ing) return false;

    const tokens = ing.split(/\s+/).filter(Boolean);

    return pantryNames.some((p) => {
      if (p.includes(ing) || ing.includes(p)) return true;
      return tokens.some((t) => t.length >= 3 && p.includes(t));
    });
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

  function esc(s) {
    return String(s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function money(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "$0.00";
    return `$${x.toFixed(2)}`;
  }

  function msg(text, ok = true) {
    if (!filterMsg) return;
    filterMsg.textContent = text;
    filterMsg.className = "form-message" + (ok ? " success" : " error");
    setTimeout(() => {
      filterMsg.textContent = "";
      filterMsg.className = "form-message";
    }, 2500);
  }

  function recipeFitsPantry(recipe, pset) {
    const ings = (recipe.ingredients || []).map((x) => String(x).toLowerCase());
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

  function recipeMatchesDiet(recipe, dietValue) {
    if (!dietValue || dietValue.toLowerCase() === "any") return true;

    const tags = (recipe.tags || []).map((t) => String(t).toLowerCase());

    if (dietValue === "Vegetarian".toLowerCase()) {
      return tags.includes("vegetarian");
    }
    if (dietValue === "Vegan".toLowerCase()) {
      return tags.includes("vegan");
    }
    if (dietValue === "Gluten-free".toLowerCase()) {
      return tags.includes("glutenfree") || tags.includes("gluten-free");
    }

    return true;
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
        msg("Already saved to Favorites.", true);
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to save favorite");
      }

      msg("Saved to Favorites!", true);
    } catch (err) {
      console.error(err);
      msg("Could not save favorite.", false);
    }
  }

  function viewRecipe(recipe) {
    const ingredients = (recipe.ingredients || []).join(", ");
    const steps = (recipe.steps || []).join(" → ");
    const substitutions = (recipe.substitutions || []).join(", ") || "None listed";

    openModal(recipe);
  }

  function renderRecipes(recipes) {
    if (!cardsContainer) return;

    if (!recipes.length) {
      cardsContainer.innerHTML = `
        <article class="card">
          <div class="title"><span>No recipes found</span><small>try different filters</small></div>
          <p class="muted" style="margin-top:10px;">
            No demo recipes matched your current filters. Try raising max cost/time or turning off pantry-only.
          </p>
        </article>

      `;
      return;
    }

    cardsContainer.innerHTML = recipes
      .map((r, idx) => {
        const tone = idx % 3 === 0 ? "sleep" : idx % 3 === 1 ? "energy" : "exercise";
        const tagText = (r.tags || []).join(" • ");
        const matchedCount = (r.ingredients || []).filter(ingredientInPantry).length;
        const totalCount = (r.ingredients || []).length;
        const canCookNow = totalCount > 0 && matchedCount === totalCount;
        return `
          <article class="card ${tone}" data-id="${esc(r.id || r.name)}">
            <div class="title">
              <span>${esc(String(r.name || "").toUpperCase())}</span>
              <small>${money(r.costPerServing)}/serving</small>
            </div>
            <div class="muted" style="margin-top:10px;">
              ⏱ ${esc(r.minutes)} min${tagText ? ` • ${esc(tagText)}` : ""}
            </div>
            <div class="muted" style="margin-top:6px;">
              Pantry match: ${matchedCount}/${totalCount}
            </div>
            ${
              canCookNow
                ? `<div class="muted" style="margin-top:6px; color: var(--success); font-weight:600;">
                    ✔ Cook with what I have
                  </div>`
                : ``
            }
            <div class="btnrow">
              <button class="btn" type="button" data-action="view"><span>View</span></button>
              <button class="btn magenta" type="button" data-action="save"><span>Save</span></button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function applyFilters() {
    const recipes = window.DEMO?.recipes || [];
    let filtered = recipes.slice();

    const maxCost = parseFloat(costInput?.value || "");
    const maxTime = parseInt(timeInput?.value || "", 10);
    const dietValue = (dietSelect?.value || "Any").toLowerCase();
    const pantryOnly = (pantryOnlySelect?.value || "No").toLowerCase() === "yes";

    if (!Number.isNaN(maxCost)) {
      filtered = filtered.filter((r) => Number(r.costPerServing) <= maxCost);
    }

    if (!Number.isNaN(maxTime)) {
      filtered = filtered.filter((r) => Number(r.minutes) <= maxTime);
    }

    if (dietValue !== "any") {
      filtered = filtered.filter((r) => recipeMatchesDiet(r, dietValue));
    }

    if (pantryOnly) {
      const pset = new Set(pantryNames);
      filtered = filtered.filter((r) => recipeFitsPantry(r, pset));
    }

    renderRecipes(filtered);
    msg(`Showing ${filtered.length} recipe${filtered.length === 1 ? "" : "s"}.`, true);
  }

  filterBtn?.addEventListener("click", applyFilters);

  cardsContainer?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-action]");
    if (!btn) return;

    const card = btn.closest("article[data-id]");
    const id = card?.getAttribute("data-id");
    if (!id) return;

    const recipes = window.DEMO?.recipes || [];
    const recipe = recipes.find((r) => String(r.id || r.name) === id);
    if (!recipe) return;

    const action = btn.getAttribute("data-action");

    if (action === "save") {
      saveFavorite(recipe);
      return;
    }

    if (action === "view") {
      viewRecipe(recipe);
    }
  });
  function openModal(recipe) {
    const modal = document.getElementById("recipeModal");
    const title = document.getElementById("modalTitle");
    const meta = document.getElementById("modalMeta");
    const body = document.getElementById("modalBody");

    title.textContent = recipe.name;
    meta.textContent = `$${recipe.costPerServing}/serving • ${recipe.minutes} min`;

    const ingredientsHtml = (recipe.ingredients || [])
      .map((ing) => {
        const hasIt = ingredientInPantry(ing);
        return `<li>${hasIt ? "✔" : "✖"} ${esc(ing)} ${hasIt ? '<span class="muted">(in pantry)</span>' : '<span class="muted">(missing)</span>'}</li>`;
      })
      .join("");

    body.innerHTML = `
      <strong>Ingredients:</strong>
      <ul style="margin:8px 0 12px 18px;">
        ${ingredientsHtml || "<li>No ingredients listed.</li>"}
      </ul>

      <strong>Steps:</strong>
      <p>${(recipe.steps || []).join(" → ")}</p>

      <strong>Substitutions:</strong>
      <p>${(recipe.substitutions || []).join(", ") || "None"}</p>
    `;

    modal.classList.remove("hidden");
  }

  document.getElementById("closeModal")?.addEventListener("click", () => {
    document.getElementById("recipeModal").classList.add("hidden");
  });

  // initial render
  (async function initRecipes() {
    await loadPantryNames();
    renderRecipes(window.DEMO?.recipes || []);
  })();
})();