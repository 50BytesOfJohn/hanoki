import { describe, expect, it } from "vitest";

import { getModelDetails } from "./model-details";

/** Payload excerpts captured from each provider's live model-list response. */
describe("getModelDetails", () => {
  it("reads an OpenRouter model, converting per-token prices to per-million", () => {
    const details = getModelDetails(
      {
        id: "xiaomi/mimo-v2-omni",
        name: "Xiaomi: MiMo-V2-Omni",
        created: 1773863703,
        description: "MiMo-V2-Omni is a frontier omni-modal model.",
        context_length: 262144,
        architecture: { input_modalities: ["text", "audio", "image", "video"] },
        pricing: { prompt: "0.0000004", completion: "0.000002", input_cache_read: "0.00000008" },
        top_provider: { context_length: 262144, max_completion_tokens: 65536 },
        supported_parameters: ["reasoning", "response_format", "tools"],
      },
      "xiaomi/mimo-v2-omni",
    );

    expect(details).toMatchObject({
      creator: "xiaomi",
      releasedAt: 1773863703_000,
      contextLength: 262144,
      maxOutputTokens: 65536,
      pricing: { input: 0.4, output: 2, cachedInput: 0.08 },
      isFree: false,
    });
    expect(details.capabilities).toEqual([
      "reasoning",
      "tools",
      "vision",
      "audio",
      "video",
      "structured",
      "caching",
    ]);
  });

  it("treats a zero-priced OpenRouter model as free", () => {
    const details = getModelDetails(
      { pricing: { prompt: "0", completion: "0" } },
      "inclusionai/ling-3.0-flash-fin:free",
    );

    expect(details.isFree).toBe(true);
    expect(details.pricing).toEqual({ input: 0, output: 0, cachedInput: null });
  });

  it("reads Anthropic's RFC 3339 release date and nested capabilities", () => {
    const details = getModelDetails(
      {
        id: "claude-opus-5",
        display_name: "Claude Opus 5",
        created_at: "2026-07-24T00:00:00Z",
        max_input_tokens: 200000,
        max_tokens: 64000,
        capabilities: {
          image_input: { supported: true },
          pdf_input: { supported: true },
          thinking: { supported: true },
          structured_outputs: { supported: true },
        },
      },
      "claude-opus-5",
      "anthropic",
    );

    expect(details).toMatchObject({
      creator: "anthropic",
      releasedAt: Date.parse("2026-07-24T00:00:00Z"),
      contextLength: 200000,
      maxOutputTokens: 64000,
      pricing: null,
    });
    expect(details.capabilities).toEqual(["reasoning", "vision", "pdf", "structured"]);
  });

  it("falls back to the provider when OpenAI reports 'system' as the owner", () => {
    const details = getModelDetails(
      { id: "gpt-5.2", created: 1741009155, owned_by: "system" },
      "gpt-5.2",
      "openai",
    );

    expect(details).toMatchObject({
      creator: "openai",
      releasedAt: 1741009155_000,
      contextLength: null,
      pricing: null,
      isFree: false,
    });
  });

  it("reads Groq's context window and owner", () => {
    const details = getModelDetails(
      {
        id: "llama-3.3-70b-versatile",
        created: 1733447754,
        owned_by: "Meta",
        context_window: 131072,
        max_completion_tokens: 32768,
      },
      "llama-3.3-70b-versatile",
    );

    expect(details).toMatchObject({
      creator: "Meta",
      contextLength: 131072,
      maxOutputTokens: 32768,
    });
  });

  it("reads Mistral's flat capability booleans and max_context_length", () => {
    const details = getModelDetails(
      {
        id: "mistral-large-latest",
        created: 1756746619,
        owned_by: "mistralai",
        max_context_length: 131072,
        description: "Top-tier reasoning model.",
        capabilities: { completion_chat: true, function_calling: true, vision: true },
      },
      "mistral-large-latest",
    );

    expect(details).toMatchObject({ creator: "mistralai", contextLength: 131072 });
    expect(details.capabilities).toEqual(["tools", "vision"]);
  });

  it("keeps Together AI prices as-is because they are already per-million", () => {
    const details = getModelDetails(
      {
        id: "deepseek-ai/DeepSeek-V3",
        organization: "DeepSeek",
        created: 1735264800,
        context_length: 131072,
        pricing: { input: 1.25, output: 1.25, cached_input: 0.5, hourly: 0 },
      },
      "deepseek-ai/DeepSeek-V3",
    );

    // The "<author>/<model>" namespace wins over `organization` — it matches the id.
    expect(details.creator).toBe("deepseek-ai");
    expect(details.pricing).toEqual({ input: 1.25, output: 1.25, cachedInput: 0.5 });
  });

  it("reads Hugging Face's best live serving provider", () => {
    const details = getModelDetails(
      {
        id: "zai-org/GLM-5.3-Flash",
        created: 1787640194,
        owned_by: "zai-org",
        architecture: { input_modalities: ["text"] },
        providers: [
          { provider: "novita", status: "live", context_length: 1048576, is_free: false },
          {
            provider: "together",
            status: "live",
            context_length: 1048575,
            pricing: { input: 0.15, output: 0.5 },
            supports_tools: true,
          },
        ],
      },
      "zai-org/GLM-5.3-Flash",
    );

    expect(details).toMatchObject({ creator: "zai-org", contextLength: 1048576 });
    expect(details.capabilities).toEqual([]);
  });

  it("converts xAI's cents-per-100M-token prices to USD per million", () => {
    const details = getModelDetails(
      {
        id: "grok-4",
        created: 1751328000,
        owned_by: "xai",
        context_length: 256000,
        prompt_text_token_price: 30000,
        completion_text_token_price: 150000,
        cached_prompt_text_token_price: 7500,
      },
      "grok-4",
    );

    expect(details.pricing).toEqual({ input: 3, output: 15, cachedInput: 0.75 });
  });

  it("reads Google's token limits and thinking flag", () => {
    const details = getModelDetails(
      {
        name: "models/gemini-3-pro",
        displayName: "Gemini 3 Pro",
        description: "Multimodal reasoning model.",
        inputTokenLimit: 1048576,
        outputTokenLimit: 65536,
        thinking: true,
      },
      "gemini-3-pro",
      "google",
    );

    expect(details).toMatchObject({
      creator: "google",
      contextLength: 1048576,
      maxOutputTokens: 65536,
      releasedAt: null,
    });
    expect(details.capabilities).toEqual(["reasoning"]);
  });

  it("reads Ollama's local weight details and modified date", () => {
    const details = getModelDetails(
      {
        name: "qwen3:8b",
        modified_at: "2026-05-04T09:12:33.123Z",
        size: 5_225_376_256,
        details: { family: "qwen3", parameter_size: "8.2B", quantization_level: "Q4_K_M" },
      },
      "qwen3:8b",
    );

    expect(details).toMatchObject({
      creator: "qwen3",
      releasedAt: Date.parse("2026-05-04T09:12:33.123Z"),
      parameterSize: "8.2B",
      quantization: "Q4_K_M",
      fileSizeBytes: 5_225_376_256,
    });
  });

  it("reads the Codex CLI model list, which has no dates or pricing", () => {
    const details = getModelDetails(
      {
        slug: "gpt-5.6-sol",
        display_name: "GPT-5.6-Sol",
        description: "Latest frontier agentic coding model.",
        context_window: 272000,
        input_modalities: ["text", "image"],
        supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
      },
      "gpt-5.6-sol",
      "openai",
    );

    expect(details).toMatchObject({
      creator: "openai",
      contextLength: 272000,
      releasedAt: null,
      pricing: null,
      isFree: false,
    });
    expect(details.capabilities).toEqual(["reasoning", "vision"]);
  });

  it("returns an empty shape for a provider that reports nothing useful", () => {
    const details = getModelDetails({ id: "deepseek-chat", object: "model" }, "deepseek-chat");

    expect(details).toEqual({
      creator: null,
      description: null,
      releasedAt: null,
      contextLength: null,
      maxOutputTokens: null,
      pricing: null,
      isFree: false,
      capabilities: [],
      parameterSize: null,
      quantization: null,
      fileSizeBytes: null,
    });
  });
});
