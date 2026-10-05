# Infinite World

A browser sandbox where you combine anything into anything, then drag what you made into a living 2D world.

Start with 🌍 Earth, 💧 Water, 🔥 Fire and 💨 Air. Drop one onto another on the **crafting table** to make something new. Then drag any discovery into the **world**, where it becomes a real object: trees sway, cats wander, cars drive, rain falls, fire spreads, and people walk into houses.

## Running it

```bash
npm install
cp .env.example .env.local   # optional: add an LLM key
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm run typecheck`, `npm test`.

### The AI combination engine (optional)

An LLM decides what two things make. All API calls happen server-side in `app/api/combine`, and the key is never sent to the browser.

| Variable | Meaning |
| --- | --- |
| `LLM_API_KEY` | Secret key. If it is not set, the built-in engine is used. |
| `LLM_PROVIDER` | `anthropic` (default) or `openai-compatible` |
| `LLM_MODEL` | Optional model override (Anthropic default: `claude-opus-5-5`) |
| `LLM_BASE_URL` | Base URL for `openai-compatible` providers |

**Without a key**, the game uses a deterministic offline engine (`lib/fallback`). It has about 380 hand-written recipes plus procedural rules: modifiers, professions and word blends. So the game is still unbounded and fully playable.

## How it works

```
app/
  api/combine/route.ts   POST {a, b} → item; server cache, rate limit, de-dupe
  api/status/route.ts    is the AI engine configured?
lib/
  types.ts               ItemDef, worldTypes, sizes, categories, traits
  recipeKey.ts           commutative keys: "fire::water"
  sanitize.ts            clamps any LLM output into the safe schema
  llm/
    provider.ts          provider interface + selection from env
    providers/           anthropic.ts, openaiCompatible.ts
    generateCombination.ts  prompt + validation + fallback
  fallback/              offline catalog, recipes, procedural generator
  server/recipeStore.ts  shared server cache (.data/recipes.json, best effort)
  game/                  client store (zustand), persistence, combine, drag & drop, sound
  world/
    archetypes.ts        worldType + size + traits → layer, size, movement
    renderers.ts         one procedural canvas renderer per worldType
    interactions.ts      data-driven interaction rules (trait based)
    engine.ts            simulation loop, camera, input, lighting, particles
components/              React UI (inventory, bench, world, inspector, overlays)
```

**Safe by design.** The LLM never writes code. It returns JSON: `name, emoji, category, description, worldType, size, color, traits`. Every field is validated against fixed enums. The game engine decides how each `worldType` looks and behaves.

**Scales to thousands of items.** Nothing in the engine checks item names. Rendering comes from `worldType`, size comes from `size`, layering and movement come from the archetype, and interactions match on **traits**: `hot`, `wet`, `flammable`, `shelter`, `rideable`, `seed`, `rail`, and so on. A brand-new item like "Lava Penguin" (`animal`, traits `hot, swimming`) automatically swims, sets trees on fire, and runs from other fires.

**Adding an interaction** means appending a rule to `lib/world/interactions.ts`:

```ts
{ id: "ignite", a: hotSource, b: flammable, mode: "near", range: 90, chance: 0.6,
  effect: (sim, _a, b) => sim.ignite(b) }
```

Current rules:
- Fire ignites flammable things, and the fire spreads.
- Rain puts out fire.
- Clouds over water start raining.
- Snow freezes water, and heat melts it.
- Seeds grow when watered, by crafting Seed + Water.
- Creatures run from fire.
- People enter shelters and ride vehicles.
- Creatures eat food.
- Storms throw lightning.
- Trains run along tracks.
- A sun brightens the world, and night or moon items darken it.

**Caching.** Recipes are cached:
- in the browser, in localStorage
- on the server, in memory plus `.data/`

The same pair (in either order) never calls the API twice.

**Discovery graph.** Each discovery stores the recipe that first made it (`from`), and every known recipe is kept too. The inspector's "trace" opens the full recipe tree.

## Controls

- **Craft:** drag a chip onto another chip on the table. Tap a chip in the list to add it to the table, and double-click a table chip to duplicate it.
- **Place:** drag any discovery into the world.
- **Combine in the world:** hold one object over another until the ring fills, then release.
- **Camera:** drag empty space to pan; use the scroll wheel or pinch to zoom; ⌖ resets the view.
- **Objects:** click one to inspect it (duplicate, favorite, delete, or trace its recipe). You can also drag it to the trash, press Del to remove it, or press Ctrl/⌘+D to duplicate it.
- **Menu (⚙️):** New world (keeps your discoveries) or Erase all progress. Both ask for confirmation.

Your progress, recipe cache, world, favorites and settings are saved in localStorage.
