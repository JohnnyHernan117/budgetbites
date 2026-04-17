(function () {
  const LS_KEY = "bb.favorites.v1";
  const container = document.querySelector(".cards-3");
  const API_BASE = "https://budgetbites-api.onrender.com/api";
  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

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

  function money(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "$0.00";
    return `$${x.toFixed(2)}`;
  }

  let favorites = [];

  function render() {
    if (!container) return;

    if (!favorites.length) {
      container.innerHTML = `
        <article class="card">
          <div class="title"><span>No favorites yet</span><small>save from Chef or Recipes</small></div>
          <p class="muted" style="margin-top:10px;">Go to <b>Chef</b> or <b>Recipes</b> and save something first.</p>
          <div class="btnrow">
            <a class="btn cyan" href="chef.html" style="text-decoration:none;"><span>Open Chef</span></a>
            <a class="btn" href="recipes.html" style="text-decoration:none;"><span>Browse Recipes</span></a>
          </div>
        </article>
      `;
      return;
    }

    container.innerHTML = favorites
      .slice()
      .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""))
      .map((f) => {
        const title = esc((f.name || "").toUpperCase());
        const meta = `${money(f.costPerServing)}/serving${
          Number.isFinite(Number(f.minutes)) ? ` • ${f.minutes} min` : ""
        }`;
        const desc = esc(f.description || "Saved recipe.");
        const totalCost = Number(f.estimatedTotalCost || 0);
        return `
          <article class="card sleep" data-id="${esc(f.id || f.name)}">
            <div class="title"><span>${title}</span><small>${meta}</small></div>
            <p class="muted" style="margin-top:10px;">${desc}</p>
            <p class="muted" style="margin-top:6px;">Estimated total: ${money(totalCost)}</p>
            <div class="btnrow">
              <button class="btn cyan" type="button" data-action="cook"><span>Cook again</span></button>
              <button class="btn" type="button" data-action="view"><span>View</span></button>
              <button class="btn small danger" type="button" data-action="remove"><span>Remove</span></button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadFavorites() {

    try {
      const res = await fetch(`${API_BASE}/favorites`, {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error("Failed to load favorites");
      favorites = await res.json();
      render();
    } catch (err) {
      console.error(err);
      container.innerHTML = `
        <article class="card">
          <div class="title"><span>Could not load favorites</span><small>server error</small></div>
          <p class="muted" style="margin-top:10px;">Make sure the backend is running.</p>
        </article>
      `;
    }
  }

  function openModal(recipe) {
    document.getElementById("modalTitle").textContent = recipe.name;
    document.getElementById("modalMeta").textContent =
      `${money(recipe.costPerServing)}/serving • ${recipe.minutes} min`;

    document.getElementById("modalBody").innerHTML = `
      <strong>Ingredients:</strong><br>
      ${
        recipe.ingredients && recipe.ingredients.length
          ? recipe.ingredients.join(", ")
          : "No ingredients saved for this recipe."
      }
      <br><br>
      <strong>Steps:</strong><br>
      ${
        recipe.steps && recipe.steps.length
          ? recipe.steps.join(" → ")
          : "No steps saved for this recipe."
      }
      <br><br>
      <strong>Substitutions:</strong><br>
      ${
        recipe.substitutions && recipe.substitutions.length
          ? recipe.substitutions.join(", ")
          : "None listed."
      }
    `;

    document.getElementById("recipeModal").classList.remove("hidden");
  }

  container?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-action]");
    if (!btn) return;

    const card = btn.closest("article[data-id]");
    const id = card?.getAttribute("data-id");
    if (!id) return;

    const action = btn.getAttribute("data-action");
    const idx = favorites.findIndex((x) => String(x.id || x.name) === id);
    if (idx === -1) return;

    if (action === "remove") {
      const confirmed = confirm("Remove this recipe from favorites?");
      if (!confirmed) return;

      try {
        const res = await fetch(`${API_BASE}/favorites/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: authHeaders()
        });

        if (!res.ok) throw new Error("Delete failed");

        favorites = favorites.filter((x) => String(x.id || x.name) !== id);
        render();
      } catch (err) {
        console.error(err);
        alert("Could not remove favorite.");
      }
      return;
    }

    if (action === "cook") {
      try {
        const res = await fetch(`${API_BASE}/favorites/${encodeURIComponent(id)}/cook`, {
          method: "PATCH",
          headers: authHeaders()
        });

        if (!res.ok) throw new Error("Cook update failed");

        const updated = await res.json();
        favorites[idx] = updated;

        const lastCooked = {
          id: updated.id || updated.name,
          name: updated.name,
          cookedAt: new Date().toISOString(),
        };

        localStorage.setItem("bb.lastCooked.v1", JSON.stringify(lastCooked));

        render();
        alert(`Cooked again! Total cooks: ${updated.cookedCount}`);
      } catch (err) {
        console.error(err);
        alert("Could not update cook count.");
      }
      return;
    }

    if (action === "view") {
      openModal(favorites[idx]);
    }
  });

  document.getElementById("closeModal")?.addEventListener("click", () => {
    document.getElementById("recipeModal").classList.add("hidden");
  });

  loadFavorites();
})();