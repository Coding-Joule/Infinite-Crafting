import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { LLMConfig, LLMProvider } from "../provider";
import { CombinationSchema } from "../schema";

const DEFAULT_MODEL = "claude-opus-5-5";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(config: LLMConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, maxRetries: 1, timeout: 45_000 });
    this.model = config.model || DEFAULT_MODEL;
  }

  async generateJSON({ system, user, signal }: { system: string; user: string; signal?: AbortSignal }) {
    const response = await this.client.beta.messages.parse(
      {
        model: this.model,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
        // A short creative classification task: low effort keeps it fast.
        output_config: { effort: "low", format: betaZodOutputFormat(CombinationSchema) },
        // If a safety classifier declines, let the API retry on a fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal },
    );
    if (response.stop_reason === "refusal") {
      throw new Error("Model declined this combination");
    }
    if (!response.parsed_output) {
      throw new Error(`No structured output (stop_reason: ${response.stop_reason})`);
    }
    return response.parsed_output;
  }
}
