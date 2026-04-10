(function () {
  const $ = (id) => document.getElementById(id);
  const API_BASE = "https://budgetbites-api.onrender.com/api";
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function authHeaders(extra = {}) {
    const token = localStorage.getItem("bb_token");
    return {
      ...extra,
      Authorization: `Bearer ${token}`
    };
  }

  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
  }

  function money(n) {
    const x = Number(n);
    return Number.isFinite(x) ? `$${x.toFixed(2)}` : "$0.00";
  }

  function startOfWeek(d) {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - day);
    return date;
  }

  async function loadPantryStats() {
    try {
      const res = await fetch(`${API_BASE}/pantry`, {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error("Failed to load pantry");
      const pantry = await res.json();
      setText("pantryCount", Array.isArray(pantry) ? pantry.length : 0);
    } catch (err) {
      console.error("Dashboard pantry load error:", err);
      setText("pantryCount", 0);
    }
  }
  const lastCooked = readJSON("bb.lastCooked.v1", null);
  const recipes = window.DEMO?.recipes || [];

  const storedUser = (localStorage.getItem("bb_user") || "Guest").trim() || "Guest";

  const now = new Date();
  const wkStart = startOfWeek(now);
  const wkEnd = new Date(wkStart);
  wkEnd.setDate(wkStart.getDate() + 7);

setText("welcomeUser", storedUser);
setText("spentThisWeek", money(0));
setText("weeklyGoal", money(0));
setText("weeklyGoalTile", money(0));

  async function loadBudgetStats() {
    try {
      const [budgetsRes, expensesRes] = await Promise.all([
        fetch(`${API_BASE}/budgets`, {
          headers: authHeaders()
        }),
        fetch(`${API_BASE}/expenses`, {
          headers: authHeaders()
        })
      ]);

      if (!budgetsRes.ok) throw new Error("Failed to load budgets");
      if (!expensesRes.ok) throw new Error("Failed to load expenses");

      const budgets = await budgetsRes.json();
      const expenses = await expensesRes.json();

      const spentThisWeek = (Array.isArray(expenses) ? expenses : [])
        .filter((e) => {
          const d = new Date(e.date);
          return d >= wkStart && d < wkEnd;
        })
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const weeklyGoal = Number(budgets?.weekly || 0);

      setText("spentThisWeek", money(spentThisWeek));
      setText("weeklyGoal", money(weeklyGoal));
      setText("weeklyGoalTile", money(weeklyGoal));

        const pill = $("budgetStatusPill");
        if (pill) {
          const span = pill.querySelector("span");
          if (span) {
            if (weeklyGoal > 0) {
              const diff = weeklyGoal - spentThisWeek;
              span.textContent = `${diff >= 0 ? "✅" : "⚠️"} ${money(Math.abs(diff))} ${diff >= 0 ? "under" : "over"}`;
            } else {
              span.textContent = "🧾 Set a weekly budget";
            }
          }
        }

      drawWeeklySpendChart(expenses);
    } catch (err) {
      console.error("Dashboard budget load error:", err);
      setText("spentThisWeek", money(0));
      setText("weeklyGoal", money(0));
      setText("weeklyGoalTile", money(0));

      const pill = $("budgetStatusPill");
      if (pill) {
        const span = pill.querySelector("span");
        if (span) span.textContent = "🧾 Could not load budget data";
      }

      drawWeeklySpendChart([]);
    }
  }

  setText("recipeCount", Array.isArray(recipes) ? recipes.length : 0);

  async function loadFavoriteStats() {
    try {
      const res = await fetch(`${API_BASE}/favorites`, {
        headers: authHeaders()
      });      
      if (!res.ok) throw new Error("Failed to load favorites");

      const favorites = await res.json();
      const favoritesList = Array.isArray(favorites) ? favorites : [];
      const recipesList = Array.isArray(recipes) ? recipes : [];

      setText("favoriteCount", favoritesList.length);

      const mealsCooked = favoritesList.reduce(
        (sum, f) => sum + Number(f.cookedCount || 0),
        0
      );

      const cheapestFavorite = favoritesList.length
        ? Math.min(...favoritesList.map((f) => Number(f.costPerServing || Infinity)))
        : Infinity;

      const cheapestRecipe = recipesList.length
        ? Math.min(...recipesList.map((r) => Number(r.costPerServing || Infinity)))
        : Infinity;

      const cheapestMealValue =
        Number.isFinite(cheapestFavorite) ? cheapestFavorite :
        Number.isFinite(cheapestRecipe) ? cheapestRecipe :
        0;

      setText("mealsCooked", mealsCooked);
      setText("cheapestMeal", money(cheapestMealValue));
    } catch (err) {
      console.error("Dashboard favorites load error:", err);
      setText("favoriteCount", 0);
      setText("mealsCooked", 0);

      const recipesList = Array.isArray(recipes) ? recipes : [];
      const cheapestRecipe = recipesList.length
        ? Math.min(...recipesList.map((r) => Number(r.costPerServing || Infinity)))
        : 0;

      setText("cheapestMeal", money(cheapestRecipe));
    }
  }

  if (lastCooked?.name) {
    const date = new Date(lastCooked.cookedAt);
    const formatted = date.toLocaleDateString();
    setText("lastCooked", `${lastCooked.name} (${formatted})`);
  } else {
    setText("lastCooked", "—");
  }

  const promptInput = $("chefPrompt");
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const p = chip.getAttribute("data-prompt") || "";
      if (promptInput) promptInput.value = p;
    });
  });

  const chefGoBtn = $("chefGoBtn");
  const chefMiniResult = $("chefMiniResult");
  if (chefGoBtn && chefMiniResult) {
    chefGoBtn.addEventListener("click", () => {
      const text = (promptInput?.value || "").trim();
      chefMiniResult.textContent = text
        ? `Demo suggestion for: "${text}" (wire LLM + fallback here)`
        : "Type a prompt or click a chip to get a suggestion.";
    });
  }

  function drawWeeklySpendChart(expenses) {
    const canvas = $("weeklySpendChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const totals = [0, 0, 0, 0, 0, 0, 0];

    (Array.isArray(expenses) ? expenses : []).forEach((e) => {
      const d = new Date(e.date);
      if (d >= wkStart && d < wkEnd) {
        const day = (d.getDay() + 6) % 7;
        totals[day] += Number(e.amount || 0);
      }
    });

    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = 200;
    ctx.clearRect(0, 0, width, height);

    const max = Math.max(...totals, 1);
    const barWidth = width / totals.length;

    totals.forEach((v, i) => {
      const h = v > 0 ? Math.max((v / max) * 120, 8) : 4;

      ctx.fillStyle = v > 0 ? "#7ab07a" : "rgba(122,176,122,0.18)";
      ctx.fillRect(i * barWidth + 10, height - h - 30, barWidth - 20, h);

      ctx.fillStyle = "#2c3a2f";
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(days[i], i * barWidth + barWidth / 2, height - 10);
    });
  }

  loadFavoriteStats();
  loadBudgetStats();
  loadPantryStats();
  
  window.addEventListener("storage", (e) => {
    if (
      e.key === "bb.pantry.v1" ||
      e.key === "bb.lastCooked.v1"
    ) {
      location.reload();
    }
  });
})();