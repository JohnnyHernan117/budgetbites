import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "BudgetBites server is running" });
});

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

    const pantryText = Array.isArray(pantryItems) && pantryItems.length
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

    console.log("Generated recipes:", cleaned.map(r => r.name));
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

app.listen(PORT, () => {
  console.log(`BudgetBites server running on http://localhost:${PORT}`);
});