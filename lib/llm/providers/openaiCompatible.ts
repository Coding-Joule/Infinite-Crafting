import "server-only";
import type { LLMConfig, LLMProvider } from "../provider";

/**
 * Adapter for any provider exposing an OpenAI-style /chat/completions endpoint
 * with JSON mode (OpenAI, Groq, Together, OpenRouter, local Ollama/LM Studio...).
 * Set LLM_PROVIDER=openai-compatible, LLM_BASE_URL and LLM_MODEL.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai-compatible";
  private baseUrl: string;
  private model: string;
  private apiKey: string;

  constructor(config: LLMConfig) {
    this.baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.model = config.model || "gpt-4o-mini";
    this.apiKey = config.apiKey;
  }

  async generateJSON({ system, user, signal }: { system: string; user: string; signal?: AbortSignal }) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty LLM response");
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  }
}
