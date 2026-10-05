import { NextResponse } from "next/server";
import { readLLMConfig } from "@/lib/llm/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the client whether the AI combination engine is configured (never exposes the key). */
export async function GET() {
  const config = readLLMConfig();
  return NextResponse.json({ ai: !!config, provider: config?.provider ?? null });
}
