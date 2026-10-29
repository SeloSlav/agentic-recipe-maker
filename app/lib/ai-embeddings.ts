import { createHash } from "node:crypto";
import { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings, AzureOpenAIEmbeddings } from "@langchain/openai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { MistralAIEmbeddings } from "@langchain/mistralai";
import { CohereEmbeddings } from "@langchain/cohere";
import { CohereClient } from "cohere-ai";
import { BedrockEmbeddings } from "@langchain/aws";
import { getAIConfig, type AIConfig } from "./ai-config";

class GeminiEmbeddings extends Embeddings {
  constructor(private config: AIConfig["embeddings"]) { super({ maxRetries: 1 }); }
  private async embed(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT") {
    const { baseURL, apiKey, model } = this.config;
    const response = await fetch(`${baseURL}/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ""))}:embedContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ content: { parts: [{ text }] }, taskType }), signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Gemini embeddings failed (HTTP ${response.status}). Check embedding credentials and model.`);
    const data = await response.json();
    if (!Array.isArray(data.embedding?.values) || !data.embedding.values.length || !data.embedding.values.every((n: unknown) => typeof n === "number" && Number.isFinite(n))) throw new Error("Gemini returned an invalid embedding.");
    return data.embedding.values as number[];
  }
  embedQuery(text: string) { return this.caller.call(() => this.embed(text, "RETRIEVAL_QUERY")); }
  async embedDocuments(texts: string[]) {
    // Bound concurrency without assuming a provider's batch-size limit.
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += 4) vectors.push(...await Promise.all(texts.slice(i, i + 4).map(text => this.caller.call(() => this.embed(text, "RETRIEVAL_DOCUMENT")))));
    return vectors;
  }
}

export function createEmbeddings(config: AIConfig = getAIConfig()): Embeddings | null {
  const c = config.embeddings;
  if (!c.configured) return null;
  const common = { model: c.model, apiKey: c.apiKey || "local-no-key", maxRetries: 1 };
  switch (c.transport) {
    case "ollama": return new OllamaEmbeddings({ ...common, baseUrl: c.baseURL, headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {} });
    case "google": return new GeminiEmbeddings(c);
    case "mistral": return new MistralAIEmbeddings({ ...common, serverURL: c.baseURL });
    case "cohere": return new CohereEmbeddings({ ...common, client: new CohereClient({ token: common.apiKey, environment: c.baseURL }) });
    case "bedrock": return new BedrockEmbeddings({ ...common, region: c.region, bedrockBearerToken: c.apiKey || undefined, ...(c.baseURL ? { clientOptions: { endpoint: c.baseURL } } : {}) });
    case "azure": return new AzureOpenAIEmbeddings({ ...common, azureOpenAIApiKey: common.apiKey, azureOpenAIBasePath: `${c.baseURL}/openai/deployments`, azureOpenAIApiDeploymentName: c.model, azureOpenAIApiVersion: c.apiVersion });
    case "anthropic": return null;
    default: return new OpenAIEmbeddings({ ...common, configuration: { baseURL: c.baseURL } });
  }
}

/** Different embedding spaces must never share vectors, even when dimensions match. */
export function resolveVectorTableName(name: string, config: AIConfig = getAIConfig()) {
  if (!/^[a-z][a-z0-9_]{0,45}$/.test(name)) throw new Error("Invalid vector table name");
  const c = config.embeddings;
  if (c.provider === "openai" && c.baseURL === "https://api.openai.com/v1" && c.model === "text-embedding-3-small") return name;
  const hash = createHash("sha256").update(JSON.stringify([c.provider, c.baseURL, c.region, c.model])).digest("hex").slice(0, 12);
  return `${name}_${hash}`;
}
