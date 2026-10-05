import { test } from "node:test";
import assert from "node:assert/strict";
import { recipeKey, itemId } from "../lib/recipeKey";
import { sanitizeItem, cleanName, firstEmoji } from "../lib/sanitize";
import { generateFallback } from "../lib/fallback/generateFallback";
import { CATALOG, STARTER_NAMES } from "../lib/fallback/catalog";
import { RECIPES } from "../lib/fallback/recipes";
import { archetypeFor, SIZE_PX } from "../lib/world/archetypes";

test("recipe keys are commutative and normalized", () => {
  assert.equal(recipeKey("Fire", "Water"), recipeKey("Water", "Fire"));
  assert.equal(recipeKey("  fire ", "WATER"), "fire::water");
  assert.equal(itemId("Black   Hole"), "black hole");
});

test("starter recipes match the spec", () => {
  const r = (a: string, b: string) => generateFallback({ name: a }, { name: b }).name;
  assert.equal(r("Earth", "Water"), "Mud");
  assert.equal(r("Fire", "Water"), "Steam");
  assert.equal(r("Water", "Fire"), "Steam");
  assert.equal(r("Earth", "Fire"), "Lava");
  assert.equal(r("Air", "Water"), "Cloud");
});

test("every hand-written recipe result exists in the catalog", () => {
  const missing: string[] = [];
  for (const [key, result] of RECIPES) if (!CATALOG.has(itemId(result))) missing.push(`${key} = ${result}`);
  assert.deepEqual(missing, []);
});

test("fallback is deterministic and commutative for unknown pairs", () => {
  const names = [...CATALOG.values()].map((i) => i.name);
  for (let i = 0; i < 300; i++) {
    const a = names[(i * 7) % names.length];
    const b = names[(i * 13 + 5) % names.length];
    const x = generateFallback({ name: a }, { name: b });
    const y = generateFallback({ name: b }, { name: a });
    assert.deepEqual(x, y, `${a} + ${b}`);
    assert.ok(x.name.length > 0 && x.name.length <= 28);
    assert.ok(x.name.split(" ").length <= 3, x.name);
  }
});

test("fallback handles items it has never seen", () => {
  const r = generateFallback({ name: "Technomancer Cat", emoji: "🐱" }, { name: "Quantum Toaster" });
  assert.ok(r.name);
  assert.ok(r.emoji);
});

test("sanitizeItem clamps LLM output into the safe schema", () => {
  const item = sanitizeItem({
    name: '  banana <script>king</script> of the "world" ',
    emoji: "not an emoji 🍌👑",
    category: "royalty",
    worldType: "javascript",
    size: "gigantic",
    color: "red",
    traits: ["hot", "evil", "flying"],
    description: "x".repeat(500),
  })!;
  assert.ok(!/[<>"]/.test(item.name));
  assert.ok(item.name.split(" ").length <= 3);
  assert.equal(item.emoji, "🍌");
  assert.equal(item.worldType, "object");
  assert.equal(item.category, "tool");
  assert.equal(item.size, "small");
  assert.match(item.color, /^#[0-9a-f]{6}$/);
  assert.deepEqual(item.traits, ["hot", "flying"]);
  assert.ok(item.description.length <= 110);
  assert.equal(sanitizeItem({ name: "" }), null);
  assert.equal(cleanName("steam"), "Steam");
  assert.equal(firstEmoji("🧑‍🌾 farmer"), "🧑‍🌾");
});

test("starters exist and world sizes are sensible", () => {
  for (const n of STARTER_NAMES) assert.ok(CATALOG.has(itemId(n)), n);
  const mountain = archetypeFor(CATALOG.get("mountain")!);
  const chicken = archetypeFor(CATALOG.get("chicken")!);
  const city = archetypeFor(CATALOG.get("city")!);
  const house = archetypeFor(CATALOG.get("house")!);
  const sun = archetypeFor(CATALOG.get("sun")!);
  assert.ok(mountain.h > chicken.h * 5);
  assert.ok(city.w > house.w);
  assert.equal(sun.layer, "sky");
  assert.equal(mountain.layer, "background");
  assert.equal(archetypeFor(CATALOG.get("rain")!).layer, "weather");
  assert.equal(archetypeFor(CATALOG.get("car")!).movement, "drive");
  assert.equal(archetypeFor(CATALOG.get("train")!).movement, "rails");
  assert.equal(archetypeFor(CATALOG.get("cat")!).movement, "wander");
  assert.ok(SIZE_PX.huge > SIZE_PX.tiny);
});
