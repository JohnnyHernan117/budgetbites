window.DEMO = window.DEMO || {};

window.DEMO.recipes = [
  {
    id: "rice-beans",
    name: "Rice & Beans Bowl",
    costPerServing: 1.20,
    minutes: 15,
    tags: ["pantry", "budget"],
    ingredients: ["rice", "beans", "onion (optional)", "seasoning"],
    steps: ["Cook rice", "Heat beans", "Combine + season"],
    substitutions: ["Beans: lentils", "Onion: garlic powder"],
  },
  {
    id: "egg-fried-rice",
    name: "Egg Fried Rice",
    costPerServing: 1.50,
    minutes: 20,
    tags: ["protein", "fast"],
    ingredients: ["rice", "eggs", "frozen veg (optional)", "soy sauce (optional)"],
    steps: ["Scramble eggs", "Add rice", "Add veg + season"],
    substitutions: ["Soy sauce: salt + garlic", "Veg: canned veg"],
  },
  {
    id: "garlic-oil-pasta",
    name: "Garlic Oil Pasta",
    costPerServing: 0.95,
    minutes: 12,
    tags: ["cheap", "minimal"],
    ingredients: ["pasta", "oil", "garlic (or powder)", "salt"],
    steps: ["Boil pasta", "Warm oil + garlic", "Toss together"],
    substitutions: ["Garlic: garlic powder", "Add-ons: beans, eggs, veg"],
  },
];

window.DEMO.pantry = [
  { name: "Rice", qty: "1 bag" },
  { name: "Beans", qty: "2 cans" },
  { name: "Eggs", qty: "12 count" },
];

window.DEMO.expenses = [
  { date: "2026-01-15", category: "grocery", note: "Weekly staples", amount: 18.32 },
  { date: "2026-01-12", category: "eating_out", note: "Tacos", amount: 9.50 },
];

window.DEMO.stats = {
  weeklyGoal: 40,
  spentThisWeek: 28,
  pantryCount: 12,
  recipeCount: 28,
  favoriteCount: 6,
  mealsCooked: 12,
  cheapestMeal: 0.87,
  savedRecipes: 6,
  weeklyStatusText: "$12 under",
};
