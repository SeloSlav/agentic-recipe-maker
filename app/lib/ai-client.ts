import type OpenAI from "openai";
import { requireAIConfig } from "./ai-config";
import { createChatModel, messageText } from "./ai-model";
import type { BaseMessageLike } from "@langchain/core/messages";

type CompletionRequest = Pick<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model" | "messages" | "temperature" | "max_tokens" | "response_format">;

/** Normalized completion interface for app endpoints, using each provider's native adapter. */
export function lazyAIClient(capability: "text" | "vision" = "text") {
  return { chat: { completions: { async create(request: CompletionRequest) {
    const config = requireAIConfig(capability);
    const json = request.response_format?.type === "json_object";
    const messages = request.messages as BaseMessageLike[];
    const model = createChatModel(capability === "vision" ? "vision" : "enrichment", {
      model: request.model, temperature: request.temperature ?? undefined, maxTokens: request.max_tokens ?? undefined, json,
    }, config);
    const input = json ? [{ role: "system", content: "Return only a valid JSON object. Do not use Markdown fences." }, ...messages] : messages;
    const invocationOptions = json && config.transport === "mistral" ? { response_format: { type: "json_object" as const } } : {};
    // The shared base type omits Mistral's provider-specific JSON option.
    const response = await model.invoke(input, invocationOptions as Parameters<typeof model.invoke>[1]);
    const content = messageText(response);
    // Native providers can include fences even when asked for JSON (e.g. Claude).
    const normalized = json ? content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim() : content;
    return { choices: [{ message: { content: normalized } }] };
  } } } };
}
