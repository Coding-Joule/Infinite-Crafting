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

### GitHub Pages

Every push to `main` deploys a static build to GitHub Pages (`.github/workflows/pages.yml`).
Pages can't run server code, so that build uses the built-in combination engine in the browser.
For AI combinations, host the full app somewhere that runs Node (e.g. Vercel) with `LLM_API_KEY` set.

One-time setup: **Settings → Pages → Source: GitHub Actions**.

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
    life.ts              pure life rules: diets, who hunts whom, lifespans, fuel
    lifeSystem.ts        bodies & needs: health, hunger, sleep, aging, births, plants, fire fuel
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
- Creatures run from fire, and firefighters (anything `wet` and alive) put fires out.
- People visit shelters and drive vehicles.
- Storms throw lightning.
- Trains run along tracks.
- A sun brightens the world, and night or moon items darken it.

## Real-life simulation

Living things (`human`/`animal` with the `living` trait) follow real-world rules (`lib/world/lifeSystem.ts`):

- **Bodies.** Each creature has health, food and energy, shown live in the inspector.
  - Being in fire or lava, drowning, a fish out of water, freezing snow, starvation, lightning, a predator, or old age can kill it. It then floats away as a 👻 and the world news reports it.
  - Creatures are born as babies, grow up, become elders, and have a lifespan based on their size. Magic and space beings are ageless.
- **Food chain.** Diets come from traits:
  - Herbivores graze plants, which shrink and regrow.
  - `predator`s hunt smaller prey. Big hunters (lions, bears) also take prey their own size and can catch people; small ones (cats) only take smaller prey.
  - People eat food, harvest crops and fruit (plants in the `food` category), and catch small edible animals.
  - Prey runs away, and people run indoors.
- **Daily routine.** At night people walk home to a shelter and sleep until morning; animals lie down where they are. `night` creatures (owls, bats) do the opposite.
- **Families.** Two healthy, well-fed adults of the same kind have a baby (people also need a home nearby). Population caps keep it manageable.
- **Water.** Land animals avoid water and swim back to shore if dropped in. `aquatic` creatures (fish, whales) only live in water, and sharks can't chase prey onto land. Frozen lakes can be walked on.
- **Plants.** Saplings grow, and mature plants spread seeds (faster near water or rain). Burnt trees regrow, and people rebuild burnt houses.
- **Physics.** Fires run out of fuel. Cars, boats and trains don't move without a driver. Snow covers the ground. People flee burning buildings.

The clock shows the day and time, the ticker shows world news, and ▶/⏩/⏭ runs time at 1×, 3× or 10×.

All of this is derived from `worldType`, `size`, `category` and traits, so items the AI invents follow the same rules.

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
