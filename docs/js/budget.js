(function () {

  const LS_KEYS = {
    chartMode: "bb.budget.chartMode.v1",
  };

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

  async function loadBudgets() {
    const res = await fetch(`${API_BASE}/budgets`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error("Failed to load budgets");
    budgets = await res.json();
  }

  async function loadExpenses() {
    const res = await fetch(`${API_BASE}/expenses`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error("Failed to load expenses");
    expenses = await res.json();
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function money(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return "$0.00";
    return `$${x.toFixed(2)}`;
  }

  function msg(id, text, ok = true) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = "form-message" + (ok ? " success" : " error");
    setTimeout(() => {
      el.textContent = "";
      el.className = "form-message";
    }, 2500);
  }

  function parseAmount(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : NaN;
  }

  function startOfWeek(d) {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; 
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - day);
    return date;
  }

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function isoDate(d) {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  let budgets = { weekly: "", monthly: "", yearly: "" };
  let expenses = [];
  let chartMode = readJSON(LS_KEYS.chartMode, "week");

  const weeklyBudget = $("weeklyBudget");
  const monthlyBudget = $("monthlyBudget");
  const yearlyBudget = $("yearlyBudget");

  const expenseAmount = $("expenseAmount");
  const expenseDate = $("expenseDate");
  const expenseCategory = $("expenseCategory");
  const expenseNote = $("expenseNote");

  const pill = $("budgetPill");
  const tableBody = $("expenseTableBody");
  const canvas = $("spendChart");
  const ctx = canvas?.getContext?.("2d") || null;

  function renderBudgets() {
    if (weeklyBudget) weeklyBudget.value = budgets.weekly ?? "";
    if (monthlyBudget) monthlyBudget.value = budgets.monthly ?? "";
    if (yearlyBudget) yearlyBudget.value = budgets.yearly ?? "";
  }

  function renderRecentExpenses() {
    if (!tableBody) return;
    const sorted = expenses
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 10);

    if (!sorted.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="muted">No expenses yet — add one above.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = sorted
      .map((e) => {
        const catLabel =
          e.category === "grocery"
            ? "Grocery"
            : e.category === "eating_out"
              ? "Eating out"
              : e.category === "snack"
                ? "Snack"
                : "Other";
        return `
        <tr data-id="${e.id}">
          <td>${e.date}</td>
          <td>${catLabel}</td>
          <td>${(e.note || "").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</td>
          <td style="text-align:right;">${money(e.amount)}</td>
          <td style="text-align:right;">
            <button class="btn small danger" data-action="delete" data-id="${e.id}">
              <span>Delete</span>
            </button>
          </td>
        </tr>
        `;
      })
      .join("");
  }

  tableBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='delete']");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    const confirmed = confirm("Delete this expense?");
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/expenses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders()
      });

      if (!res.ok) throw new Error("Failed to delete expense");

      expenses = expenses.filter((x) => x.id !== id);
      rerenderAll();
      msg("expenseMsg", "Expense deleted.", true);
    } catch (err) {
      console.error(err);
      msg("expenseMsg", "Could not delete expense.", false);
    }
  });

  function renderPill() {
    if (!pill) return;
    const wk = parseAmount(budgets.weekly);
    if (!Number.isFinite(wk) || wk <= 0) {
      pill.innerHTML = `<span>🧾 Set a weekly budget</span><small class="muted">to track status</small>`;
      return;
    }

    const now = new Date();
    const wkStart = startOfWeek(now);
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkStart.getDate() + 7);

    const spent = expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d >= wkStart && d < wkEnd;
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const diff = wk - spent;
    const isUnder = diff >= 0;
    const abs = Math.abs(diff);
    pill.innerHTML = `<span>${isUnder ? "✅" : "⚠️"} ${money(abs)} ${isUnder ? "under" : "over"}</span><small class="muted">this week</small>`;
  }

  function sizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(220 * dpr));
    canvas.style.height = "220px";
  }

  function drawChart() {
    if (!canvas || !ctx) return;
    sizeCanvas();

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const dpr = window.devicePixelRatio || 1;
    const pad = Math.floor(w * 0.06);
    const baseY = h - pad * 1.35;
    const chartTop = pad * 0.75;
    const chartHeight = baseY - chartTop;

    const COLORS = {
      axis: "rgba(31, 42, 34, 0.18)",
      label: "rgba(31, 42, 34, 0.72)",
      bar: "#7ab07a",
      barAlt: "#c8d8c0",
      empty: "rgba(122, 176, 122, 0.20)",
      value: "rgba(31, 42, 34, 0.85)",
    };

    const now = new Date();
    let labels = [];
    let values = [];

    if (chartMode === "week") {
      const start = startOfWeek(now);

      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);

        labels.push(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]);

        const total = expenses
          .filter((e) => sameDay(new Date(e.date), d))
          .reduce((s, e) => s + Number(e.amount || 0), 0);

        values.push(total);
      }
    } else if (chartMode === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      let bucketStart = new Date(monthStart);
      let weekIndex = 1;

      while (bucketStart < monthEnd) {
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setDate(bucketStart.getDate() + 7);

        labels.push(`W${weekIndex}`);

        const total = expenses
          .filter((e) => {
            const d = new Date(e.date);
            return d >= bucketStart && d < bucketEnd && d < monthEnd;
          })
          .reduce((s, e) => s + Number(e.amount || 0), 0);

        values.push(total);
        bucketStart = bucketEnd;
        weekIndex += 1;
      }
    } else {
      const year = now.getFullYear();

      for (let m = 0; m < 12; m++) {
        const a = new Date(year, m, 1);
        const b = new Date(year, m + 1, 1);

        labels.push(a.toLocaleString(undefined, { month: "short" }));

        const total = expenses
          .filter((e) => {
            const d = new Date(e.date);
            return d >= a && d < b;
          })
          .reduce((s, e) => s + Number(e.amount || 0), 0);

        values.push(total);
      }
    }

    const max = Math.max(1, ...values);

    ctx.save();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = Math.max(1, 1.25 * dpr);
    ctx.beginPath();
    ctx.moveTo(pad, baseY);
    ctx.lineTo(w - pad, baseY);
    ctx.stroke();
    ctx.restore();

    const barCount = values.length;
    const innerW = w - pad * 2;
    const gap = innerW / (barCount * 6);
    const barW = (innerW - gap * (barCount - 1)) / barCount;

    values.forEach((val, i) => {
      const x = pad + i * (barW + gap);

      const rawBarH = (chartHeight * val) / max;
      const barH = val > 0 ? Math.max(rawBarH, 8 * dpr) : 0;
      const y = baseY - barH;

      if (val === 0) {
        ctx.save();
        ctx.fillStyle = COLORS.empty;
        const ghostH = 6 * dpr;
        ctx.fillRect(x, baseY - ghostH, barW, ghostH);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = i % 2 === 0 ? COLORS.bar : COLORS.barAlt;
        ctx.fillRect(x, y, barW, barH);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = COLORS.value;
        ctx.font = `${Math.max(10, Math.floor(w / 90))}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.textAlign = "center";
        ctx.fillText(`$${val.toFixed(0)}`, x + barW / 2, y - 8 * dpr);
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = COLORS.label;
      ctx.font = `${Math.max(10, Math.floor(w / 70))}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textAlign = "center";
      ctx.fillText(labels[i], x + barW / 2, baseY + 18 * dpr);
      ctx.restore();
  });
}

  function persistChartMode() {
    writeJSON(LS_KEYS.chartMode, chartMode);
  }

  function rerenderAll() {
    renderBudgets();
    renderRecentExpenses();
    renderPill();
    drawChart();
  }

  $("saveBudgetBtn")?.addEventListener("click", async () => {
    try {
      const payload = {
        weekly: weeklyBudget?.value || "",
        monthly: monthlyBudget?.value || "",
        yearly: yearlyBudget?.value || "",
      };

      const res = await fetch(`${API_BASE}/budgets`, {
        method: "PUT",
        headers: authHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save budgets");

      budgets = await res.json();
      renderBudgets();
      renderPill();
      msg("budgetMsg", "Budget saved.", true);
    } catch (err) {
      console.error(err);
      msg("budgetMsg", "Could not save budget.", false);
    }
  });

  $("addExpenseBtn")?.addEventListener("click", async () => {
    const amt = parseAmount(expenseAmount?.value);
    const date = expenseDate?.value;
    const category = expenseCategory?.value || "other";
    const note = (expenseNote?.value || "").trim();

    if (!Number.isFinite(amt) || amt <= 0) {
      msg("expenseMsg", "Enter a valid amount.", false);
      return;
    }
    if (!date) {
      msg("expenseMsg", "Pick a date.", false);
      return;
    }

    const payload = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      amount: amt,
      date,
      category,
      note,
    };

    try {
      const res = await fetch(`${API_BASE}/expenses`, {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

      if (!res.ok) throw new Error("Failed to add expense");

      const created = await res.json();
      expenses.push(created);

      document.getElementById("expenseForm")?.reset();
      if (expenseDate && !expenseDate.value) expenseDate.value = isoDate(new Date());

      rerenderAll();
      msg("expenseMsg", "Expense added.", true);
    } catch (err) {
      console.error(err);
      msg("expenseMsg", "Could not add expense.", false);
    }
  });

  $("toggleWeek")?.addEventListener("click", () => {
    chartMode = "week";
    persistChartMode();
    drawChart();
    msg("budgetMsg", "Switched to Weekly.", true);
  });
  $("toggleMonth")?.addEventListener("click", () => {
    chartMode = "month";
    persistChartMode();
    drawChart();
    msg("budgetMsg", "Switched to Monthly.", true);
  });
  $("toggleYear")?.addEventListener("click", () => {
    chartMode = "year";
    persistChartMode();
    drawChart();
    msg("budgetMsg", "Switched to Yearly.", true);
  });

  window.addEventListener("resize", () => drawChart());

  async function init() {
  try {
    await loadBudgets();
    await loadExpenses();

    if (expenseDate && !expenseDate.value) expenseDate.value = isoDate(new Date());
      rerenderAll();
    } catch (err) {
      console.error(err);
      msg("budgetMsg", "Could not load budget data.", false);
    }
  }

  init();
})();