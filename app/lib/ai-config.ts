/** Server-side provider configuration. Credentials never belong in diagnostics. */
export type AIEnvironment = Record<string, string | undefined>;
type Transport = "openai" | "anthropic" | "google" | "ollama" | "mistral" | "cohere" | "bedrock" | "azure";
type Preset = { transport: Transport; url: string; key?: string; embedding?: string };
export const AI_PROVIDERS = {
  openai: { transport: "openai", url: "https://api.openai.com/v1", key: "OPENAI_API_KEY", embedding: "text-embedding-3-small" },
  anthropic: { transport: "anthropic", url: "https://api.anthropic.com", key: "ANTHROPIC_API_KEY" },
  google: { transport: "google", url: "https://generativelanguage.googleapis.com", key: "GOOGLE_API_KEY", embedding: "gemini-embedding-001" },
  mistral: { transport: "mistral", url: "https://api.mistral.ai", key: "MISTRAL_API_KEY", embedding: "mistral-embed" },
  cohere: { transport: "cohere", url: "https://api.cohere.com", key: "COHERE_API_KEY", embedding: "embed-english-v3.0" },
  bedrock: { transport: "bedrock", url: "", key: "AWS_BEARER_TOKEN_BEDROCK", embedding: "amazon.titan-embed-text-v2:0" },
  azure: { transport: "azure", url: "", key: "AZURE_OPENAI_API_KEY" },
  groq: { transport: "openai", url: "https://api.groq.com/openai/v1", key: "GROQ_API_KEY" },
  together: { transport: "openai", url: "https://api.together.xyz/v1", key: "TOGETHER_API_KEY" },
  fireworks: { transport: "openai", url: "https://api.fireworks.ai/inference/v1", key: "FIREWORKS_API_KEY" },
  openrouter: { transport: "openai", url: "https://openrouter.ai/api/v1", key: "OPENROUTER_API_KEY" },
  deepseek: { transport: "openai", url: "https://api.deepseek.com/v1", key: "DEEPSEEK_API_KEY" },
  xai: { transport: "openai", url: "https://api.x.ai/v1", key: "XAI_API_KEY" },
  cerebras: { transport: "openai", url: "https://api.cerebras.ai/v1", key: "CEREBRAS_API_KEY" },
  huggingface: { transport: "openai", url: "https://router.huggingface.co/v1", key: "HF_TOKEN" },
  nvidia: { transport: "openai", url: "https://integrate.api.nvidia.com/v1", key: "NVIDIA_API_KEY" },
  ollama: { transport: "ollama", url: "http://127.0.0.1:11434", embedding: "nomic-embed-text" },
  vllm: { transport: "openai", url: "http://127.0.0.1:8000/v1" },
  llamacpp: { transport: "openai", url: "http://127.0.0.1:8080/v1" },
  localai: { transport: "openai", url: "http://127.0.0.1:8080/v1" },
  lmstudio: { transport: "openai", url: "http://127.0.0.1:1234/v1" },
  "openai-compatible": { transport: "openai", url: "" },
} satisfies Record<string, Preset>;
export type AIProvider = keyof typeof AI_PROVIDERS;
export type AIConnection = { provider: string; transport: Transport; baseURL: string; apiKey: string; region: string; apiVersion: string; configured: boolean; error: string };
export type AIConfig = AIConnection & {
  models: { chat: string; recipeGeneration: string; enrichment: string; translation: string; vision: string; embedding: string };
  embeddings: AIConnection & { model: string };
};
const localURL = (value: string) => { try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname); } catch { return false; } };
const presetFor = (provider: string): Preset | undefined => Object.hasOwn(AI_PROVIDERS, provider) ? AI_PROVIDERS[provider as AIProvider] : undefined;

function connection(provider: string, rawURL: string | undefined, key: string | undefined, env: AIEnvironment): AIConnection {
  const preset = presetFor(provider);
  let baseURL = (rawURL || (provider === "azure" ? env.AZURE_OPENAI_ENDPOINT : "") || preset?.url || "").replace(/\/+$/, ""), error = "";
  const transport = preset?.transport || "openai";
  const region = transport === "bedrock" ? env.AWS_REGION || env.AWS_DEFAULT_REGION || "" : "";
  const apiKey = key || (preset?.key ? env[preset.key] : "") || (provider === "google" ? env.GEMINI_API_KEY : "") || "";
  if (!preset) error = `Unknown AI provider: ${provider}. See docs/AI_PROVIDERS.md.`;
  else if (transport === "bedrock") {
    if (!region) error = "Set AWS_REGION and configure AWS credentials (environment, profile, or IAM role) for Bedrock.";
  }
  if (preset && (transport !== "bedrock" || baseURL)) {
    try {
      const url = new URL(baseURL);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch { error = "Set a valid AI API base URL, without credentials or query parameters."; baseURL = "http://127.0.0.1:0"; }
    if (!error && transport !== "bedrock" && !apiKey && !localURL(baseURL)) error = `Set AI_API_KEY or ${preset.key || "a provider API key"} for ${provider}.`;
  }
  return { provider, transport, baseURL, apiKey, region, apiVersion: env.AZURE_OPENAI_API_VERSION || "2024-10-21", configured: !error, error };
}

export function getAIConfig(env: AIEnvironment = process.env): AIConfig {
  const provider = (env.AI_PROVIDER || "openai").toLowerCase();
  const conn = connection(provider, env.AI_BASE_URL, env.AI_API_KEY, env);
  const defaultModel = env.AI_MODEL || (provider === "openai" ? "gpt-4o" : provider === "ollama" ? "qwen2.5:7b" : "");
  const smallModel = env.AI_MODEL || (provider === "openai" ? "gpt-4o-mini" : defaultModel);
  const models = {
    chat: env.AI_CHAT_MODEL || defaultModel,
    recipeGeneration: env.AI_RECIPE_MODEL || smallModel,
    enrichment: env.AI_ENRICHMENT_MODEL || smallModel,
    translation: env.AI_TRANSLATION_MODEL || smallModel,
    vision: env.AI_VISION_MODEL || (provider === "openai" ? "gpt-4o-mini" : ""), embedding: "",
  };
  if (conn.configured && (!models.chat || !models.recipeGeneration || !models.enrichment || !models.translation)) {
    conn.configured = false; conn.error = "Set AI_MODEL to a model (or Azure deployment) available from your provider.";
  }
  const embeddingProvider = (env.AI_EMBEDDING_PROVIDER || (presetFor(provider)?.embedding || env.AI_EMBEDDING_MODEL ? provider : "disabled")).toLowerCase();
  const embeddingURL = env.AI_EMBEDDING_BASE_URL || (embeddingProvider === provider ? conn.baseURL : undefined);
  // Never forward the chat key to another provider or a different embedding endpoint.
  const embeddingKey = env.AI_EMBEDDING_API_KEY || (embeddingProvider === provider && (!env.AI_EMBEDDING_BASE_URL || env.AI_EMBEDDING_BASE_URL.replace(/\/+$/, "") === conn.baseURL) ? conn.apiKey : undefined);
  const model = env.AI_EMBEDDING_MODEL || presetFor(embeddingProvider)?.embedding || "";
  const embeddings = { ...connection(embeddingProvider, embeddingURL, embeddingKey, env), model };
  if (embeddingProvider === "disabled") { embeddings.configured = false; embeddings.error = "Semantic retrieval is disabled; configure an embedding provider and model to enable it."; }
  else if (embeddings.configured && (!model || embeddingProvider === "anthropic")) { embeddings.configured = false; embeddings.error = "Choose an embedding-capable provider and set AI_EMBEDDING_MODEL."; }
  models.embedding = embeddings.configured ? model : "disabled";
  return { ...conn, models, embeddings };
}

export function requireAIConfig(capability: "text" | "vision" = "text") {
  const config = getAIConfig();
  if (!config.configured) throw new Error(config.error);
  if (capability === "vision" && !config.models.vision) throw new Error("Set AI_VISION_MODEL to a vision-capable model on your provider.");
  return config;
}

export function getPublicAIStatus(env: AIEnvironment = process.env) {
  const config = getAIConfig(env);
  return {
    provider: config.provider, models: config.models,
    text: { status: config.configured ? "configured" : "unconfigured", detail: config.configured ? `${config.provider} · ${config.models.chat} · provider not contacted` : config.error },
    embeddings: { status: config.embeddings.configured ? "configured" : "disabled", detail: config.embeddings.configured ? `${config.embeddings.provider} · ${config.embeddings.model} · provider not contacted` : config.embeddings.error },
    media: { status: env.OPENAI_API_KEY ? "configured" : "disabled", detail: env.OPENAI_API_KEY ? "Optional OpenAI image generation and transcription" : "Optional image generation and transcription require OPENAI_API_KEY" },
  };
}
