import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import pool from "./db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "BudgetBites server is running" });
});

// =====================
// FAVORITES ROUTES
// =====================

// GET all favorites
app.get("/api/favorites", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        minutes,
        cost_per_serving AS "costPerServing",
        description,
        ingredients,
        steps,
        substitutions,
        tags,
        saved_at AS "savedAt",
        cooked_count AS "cookedCount"
      FROM favorites
      WHERE user_id = $1
      ORDER BY saved_at DESC
    `, [req.user.userId]);

    res.json(result.rows);
  } catch (error) {
    console.error("GET /api/favorites error:", error);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

// POST favorite
app.post("/api/favorites", requireAuth, async (req, res) => {
  try {
    const {
      id,
      name,
      minutes,
      costPerServing,
      description,
      ingredients = [],
      steps = [],
      substitutions = [],
      tags = [],
      savedAt,
      cookedCount = 0,
    } = req.body || {};

    if (!id || !name) {
      return res.status(400).json({ error: "id and name are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO favorites (
        id, user_id, name, minutes, cost_per_serving, description,
        ingredients, steps, substitutions, tags, saved_at, cooked_count
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, COALESCE($11::timestamp, NOW()), $12
      )
      RETURNING
        id,
        name,
        minutes,
        cost_per_serving AS "costPerServing",
        description,
        ingredients,
        steps,
        substitutions,
        tags,
        saved_at AS "savedAt",
        cooked_count AS "cookedCount"
      `,
      [
        id,
        req.user.userId,
        name,
        minutes ?? null,
        costPerServing ?? null,
        description ?? "",
        JSON.stringify(ingredients),
        JSON.stringify(steps),
        JSON.stringify(substitutions),
        JSON.stringify(tags),
        savedAt ?? null,
        cookedCount,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("POST /api/favorites error:", error);
    res.status(500).json({ error: "Failed to save favorite" });
  }
});

// DELETE favorite
app.delete("/api/favorites/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM favorites WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Favorite not found" });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /api/favorites/:id error:", error);
    res.status(500).json({ error: "Failed to delete favorite" });
  }
});

// =====================
// CHEF ROUTE
// =====================

app.post("/api/chef", async (req, res) => {
  try {
    console.log("---- Chef Request ----");
    console.log("Prompt:", req.body.prompt);
    console.log("Budget:", req.body.budgetPerServing);
    console.log("Max Minutes:", req.body.maxMinutes);
    console.log("Pantry Only:", req.body.pantryOnly);
    console.log("Diet:", req.body.diet);
    console.log("Pantry Items:", req.body.pantryItems);

    const {
      prompt,
      budgetPerServing,
      maxMinutes,
      pantryOnly,
      diet,
      pantryItems = [],
    } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const pantryText =
      Array.isArray(pantryItems) && pantryItems.length
        ? pantryItems.join(", ")
        : "No pantry items provided";

    const instructions = `
You are Budget Chef for BudgetBites.
Return exactly 3 affordable meal suggestions.

Rules:
- Keep suggestions realistic and budget-conscious.
- Respect budgetPerServing if provided.
- Respect maxMinutes if provided.
- Respect pantryOnly if true.
- Respect diet if provided.
- Prefer simple, common ingredients.
- Do not include medical or nutritional guarantees.
- Keep steps short and practical.

User request: ${prompt}
Budget per serving: ${budgetPerServing ?? "not specified"}
Max minutes: ${maxMinutes ?? "not specified"}
Pantry only: ${pantryOnly ? "yes" : "no"}
Diet: ${diet || "any"}
Pantry items: ${pantryText}

Return JSON only with this shape:
{
  "recipes": [
    {
      "id": "short-id",
      "name": "Recipe name",
      "minutes": 15,
      "costPerServing": 1.75,
      "description": "One-sentence summary",
      "ingredients": ["item 1", "item 2"],
      "steps": ["step 1", "step 2"],
      "substitutions": ["sub 1", "sub 2"],
      "tags": ["vegetarian"]
    }
  ]
}
`;

    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: instructions,
    });

    const text =
      response.output_text ||
      response.output?.map((item) =>
        item.content?.map((c) => c.text).join("")
      ).join("") ||
      "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: "Model returned invalid JSON.",
        raw: text,
      });
    }

    if (!parsed?.recipes || !Array.isArray(parsed.recipes)) {
      return res.status(502).json({
        error: "Model response missing recipes array.",
        raw: parsed,
      });
    }

    const cleaned = parsed.recipes.slice(0, 3).map((r, idx) => ({
      id: r.id || `ai-${Date.now()}-${idx}`,
      name: r.name || `Option ${idx + 1}`,
      minutes: Number(r.minutes || 0),
      costPerServing: Number(r.costPerServing || 0),
      description: r.description || "",
      ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      steps: Array.isArray(r.steps) ? r.steps : [],
      substitutions: Array.isArray(r.substitutions) ? r.substitutions : [],
      tags: Array.isArray(r.tags) ? r.tags : [],
    }));

    while (cleaned.length < 3) {
      cleaned.push({
        id: `ai-fallback-${Date.now()}-${cleaned.length}`,
        name: `Option ${cleaned.length + 1}`,
        minutes: 15,
        costPerServing: 2,
        description: "Backup generated option.",
        ingredients: [],
        steps: [],
        substitutions: [],
        tags: [],
      });
    }

    console.log("Generated recipes:", cleaned.map((r) => r.name));
    console.log("----------------------");

    res.json({ recipes: cleaned });
  } catch (error) {
    console.error("Chef API error:", error);
    res.status(500).json({
      error: "Chef API failed.",
      details: error?.message || "Unknown error",
    });
  }
});

app.patch("/api/favorites/:id/cook", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE favorites
      SET cooked_count = COALESCE(cooked_count, 0) + 1
      WHERE id = $1 AND user_id = $2
      RETURNING
        id,
        name,
        minutes,
        cost_per_serving AS "costPerServing",
        description,
        ingredients,
        steps,
        substitutions,
        tags,
        saved_at AS "savedAt",
        cooked_count AS "cookedCount"
      `,
      [id, req.user.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Favorite not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("PATCH /api/favorites/:id/cook error:", error);
    res.status(500).json({ error: "Failed to update cook count" });
  }
});

// =====================
// PANTRY ROUTES
// =====================

// GET all pantry items
app.get("/api/pantry", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        qty,
        created_at AS "createdAt"
      FROM pantry_items
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [req.user.userId]);

    res.json(result.rows);
  } catch (error) {
    console.error("GET /api/pantry error:", error);
    res.status(500).json({ error: "Failed to fetch pantry items" });
  }
});

// POST pantry item
app.post("/api/pantry", requireAuth, async (req, res) => {
  try {
    const { id, name, qty = "" } = req.body || {};

    if (!id || !name) {
      return res.status(400).json({ error: "id and name are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO pantry_items (id, user_id, name, qty)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        qty,
        created_at AS "createdAt"
      `,
      [id, req.user.userId, name, qty]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("POST /api/pantry error:", error);
    res.status(500).json({ error: "Failed to save pantry item" });
  }
});

// DELETE pantry item
app.delete("/api/pantry/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM pantry_items WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Pantry item not found" });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /api/pantry/:id error:", error);
    res.status(500).json({ error: "Failed to delete pantry item" });
  }
});

// =====================
// BUDGET ROUTES
// =====================

// GET budget settings
app.get("/api/budgets", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        weekly,
        monthly,
        yearly,
        updated_at AS "updatedAt"
      FROM budgets
      WHERE user_id = $1
      LIMIT 1
    `, [req.user.userId]);

    if (!result.rows.length) {
      return res.json({ weekly: "", monthly: "", yearly: "" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("GET /api/budgets error:", error);
    res.status(500).json({ error: "Failed to fetch budgets" });
  }
});

// PUT budget settings
app.put("/api/budgets", requireAuth, async (req, res) => {
  try {
    const { weekly = null, monthly = null, yearly = null } = req.body || {};

    const result = await pool.query(
      `
      INSERT INTO budgets (budget_id, user_id, weekly, monthly, yearly, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        weekly = EXCLUDED.weekly,
        monthly = EXCLUDED.monthly,
        yearly = EXCLUDED.yearly,
        updated_at = NOW()
      RETURNING
        weekly,
        monthly,
        yearly,
        updated_at AS "updatedAt"
      `,
      [req.user.userId, weekly || null, monthly || null, yearly || null]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("PUT /api/budgets error:", error);
    res.status(500).json({ error: "Failed to save budgets" });
  }
});

// =====================
// EXPENSE ROUTES
// =====================

// GET expenses
app.get("/api/expenses", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        amount,
        date,
        category,
        note,
        created_at AS "createdAt"
      FROM expenses
      WHERE user_id = $1
      ORDER BY date DESC, created_at DESC
    `, [req.user.userId]);

    res.json(result.rows);
  } catch (error) {
    console.error("GET /api/expenses error:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// POST expense
app.post("/api/expenses", requireAuth, async (req, res) => {
  try {
    const {
      id,
      amount,
      date,
      category = "other",
      note = ""
    } = req.body || {};

    if (!id || !amount || !date) {
      return res.status(400).json({ error: "id, amount, and date are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO expenses (id, user_id, amount, date, category, note)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        amount,
        date,
        category,
        note,
        created_at AS "createdAt"
      `,
      [id, req.user.userId, amount, date, category, note]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("POST /api/expenses error:", error);
    res.status(500).json({ error: "Failed to save expense" });
  }
});

// DELETE expense
app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Expense not found" });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /api/expenses/:id error:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

//reset DEMO
app.post("/api/reset-demo", requireAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM expenses WHERE user_id = $1", [req.user.userId]);
    await pool.query("DELETE FROM pantry_items WHERE user_id = $1", [req.user.userId]);
    await pool.query("DELETE FROM favorites WHERE user_id = $1", [req.user.userId]);
    await pool.query("DELETE FROM budgets WHERE user_id = $1", [req.user.userId]);

    res.json({ success: true });
  } catch (error) {
    console.error("POST /api/reset-demo error:", error);
    res.status(500).json({ error: "Failed to reset demo data" });
  }
});

// =========================
// AUTH ROUTES
// =========================

  app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query(
      `SELECT id FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    if (existing.rows.length) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, name, email
      `,
      [name.trim(), normalizedEmail, hash]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({
      error: "Signup failed",
      details: err.message
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = $1
      `,
      [normalizedEmail]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      error: "Login failed",
      details: err.message
    });
  }
});

app.get("/api/me", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    res.json({
      user: {
        id: payload.userId,
        name: payload.name,
        email: payload.email
      }
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

  // =========================
// FORUM ROUTES
// =========================

// Get all posts
app.get("/api/forum", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        body,
        tags,
        created_at AS "createdAt"
      FROM forum_posts
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("GET /api/forum error:", error);
    res.status(500).json({ error: "Failed to fetch forum posts" });
  }
});

// Create post
app.post("/api/forum", async (req, res) => {
  try {
    const { id, title, body, tags = [] } = req.body || {};

    if (!id || !title || !body) {
      return res.status(400).json({ error: "id, title, and body are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO forum_posts (id, title, body, tags)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        title,
        body,
        tags,
        created_at AS "createdAt"
      `,
      [id, title, body, tags]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("POST /api/forum error:", error);
    res.status(500).json({ error: "Failed to create forum post" });
  }
});

app.listen(PORT, () => {
  console.log(`BudgetBites server running on http://localhost:${PORT}`);
});