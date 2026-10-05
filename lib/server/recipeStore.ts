import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { ItemDef } from "../types";

/**
 * Server-side cache of generated combinations, shared by all players.
 * Kept in memory and persisted best-effort to .data/recipes.json
 * (silently memory-only on read-only/serverless file systems).
 *
 * `items` keeps the first definition seen for each item name so the same
 * result always looks the same no matter which pair produced it.
 */
interface StoreShape {
  recipes: Record<string, string>; // recipeKey -> item id
  items: Record<string, ItemDef>; // item id -> definition
}

const FILE = path.join(process.cwd(), ".data", "recipes.json");
let store: StoreShape | null = null;
let loading: Promise<StoreShape> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

async function load(): Promise<StoreShape> {
  if (store) return store;
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await fs.readFile(FILE, "utf8");
        const parsed = JSON.parse(raw) as StoreShape;
        store = { recipes: parsed.recipes ?? {}, items: parsed.items ?? {} };
      } catch {
        store = { recipes: {}, items: {} };
      }
      return store;
    })();
  }
  return loading;
}

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    if (!store) return;
    try {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(store));
    } catch {
      // Read-only file system: keep the in-memory cache only.
    }
  }, 1000);
}

export async function getCachedRecipe(key: string): Promise<ItemDef | null> {
  const s = await load();
  const id = s.recipes[key];
  return id ? s.items[id] ?? null : null;
}

/** Store a recipe; returns the canonical item definition for the result. */
export async function putRecipe(key: string, item: ItemDef): Promise<ItemDef> {
  const s = await load();
  const canonical = s.items[item.id] ?? item;
  s.items[item.id] = canonical;
  s.recipes[key] = canonical.id;
  scheduleWrite();
  return canonical;
}
