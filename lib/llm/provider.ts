import "server-only";

/**
 * Provider-agnostic LLM interface. A provider receives a system prompt and a
 * user prompt and must return a single JSON object (unvalidated — the caller
 * sanitizes it). Add a new provider by implementing this interface and
 * registering it in getProvider().
 */
export interface LLMProvider {
  readonly name: string;
  generateJSON(args: { system: string; user: string; signal?: AbortSignal }): Promise<unknown>;
}

export interface LLMConfig {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function readLLMConfig(): LLMConfig | null {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    provider: (process.env.LLM_PROVIDER || "anthropic").trim().toLowerCase(),
    apiKey,
    model: process.env.LLM_MODEL?.trim() || undefined,
    baseUrl: process.env.LLM_BASE_URL?.trim() || undefined,
  };
}

let cached: { key: string; provider: LLMProvider } | null = null;

/** Returns the configured provider, or null when no API key is set (fallback mode). */
export async function getProvider(): Promise<LLMProvider | null> {
  const config = readLLMConfig();
  if (!config) return null;
  const key = `${config.provider}|${config.model}|${config.baseUrl}`;
  if (cached?.key === key) return cached.provider;

  let provider: LLMProvider;
  switch (config.provider) {
    case "openai":
    case "openai-compatible": {
      const { OpenAICompatibleProvider } = await import("./providers/openaiCompatible");
      provider = new OpenAICompatibleProvider(config);
      break;
    }
    case "anthropic":
    case "claude":
    default: {
      const { AnthropicProvider } = await import("./providers/anthropic");
      provider = new AnthropicProvider(config);
      break;
    }
  }
  cached = { key, provider };
  return provider;
}
