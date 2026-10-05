import { NextResponse } from "next/server";
import { recipeKey } from "@/lib/recipeKey";
import { sanitizeInputName, firstEmoji } from "@/lib/sanitize";
import { generateCombination } from "@/lib/llm/generateCombination";
import { getCachedRecipe, putRecipe } from "@/lib/server/recipeStore";
import type { CombineResponse, ItemDef } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple per-IP rate limit to protect the API key from abuse.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  entry.count++;
  return entry.count > MAX_PER_WINDOW;
}

// De-duplicate concurrent requests for the same pair.
const inflight = new Map<string, Promise<CombineResponse>>();

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { a, b } = (body ?? {}) as { a?: { name?: unknown; emoji?: unknown }; b?: { name?: unknown; emoji?: unknown } };
  const nameA = sanitizeInputName(a?.name);
  const nameB = sanitizeInputName(b?.name);
  if (!nameA || !nameB) {
    return NextResponse.json({ error: "Two item names are required" }, { status: 400 });
  }
  const key = recipeKey(nameA, nameB);

  const cached = await getCachedRecipe(key);
  if (cached) return NextResponse.json({ item: cached, source: "cache" } satisfies CombineResponse);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Slow down a little!" }, { status: 429 });
  }

  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      const result = await generateCombination(
        { name: nameA, emoji: firstEmoji(a?.emoji) ?? undefined },
        { name: nameB, emoji: firstEmoji(b?.emoji) ?? undefined },
      );
      const item: ItemDef = await putRecipe(key, result.item);
      return { item, source: result.source };
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  try {
    return NextResponse.json(await job);
  } catch (err) {
    console.error("[combine] failed", err);
    return NextResponse.json({ error: "Combination failed" }, { status: 500 });
  }
}
