import { ChatOpenAI, AzureChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogle } from "@langchain/google";
import { ChatOllama } from "@langchain/ollama";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatCohere } from "@langchain/cohere";
import { CohereClient } from "cohere-ai";
import { ChatBedrockConverse } from "@langchain/aws";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { getAIConfig, type AIConfig } from "./ai-config";

export type ModelRole = "chat" | "recipeGeneration" | "enrichment" | "translation" | "vision";
export type ModelOptions = { temperature?: number; maxTokens?: number; model?: string; json?: boolean };

/** Native transports for distinct APIs; compatible hosts use their documented chat endpoint. */
export function createChatModel(role: ModelRole, options: ModelOptions = {}, config: AIConfig = getAIConfig()): BaseChatModel {
  const { model: override, json, ...sampling } = options;
  const model = override || config.models[role] || "unconfigured-model";
  const apiKey = config.apiKey || "local-no-key";
  const common = { ...sampling, model, maxRetries: 1 };
  switch (config.transport) {
    case "anthropic": return new ChatAnthropic({ ...common, maxTokens: sampling.maxTokens ?? 4096, apiKey, clientOptions: { baseURL: config.baseURL } });
    case "google": return new ChatGoogle({ ...common, apiKey, platformType: "gai", endpoint: config.baseURL, maxOutputTokens: sampling.maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) });
    case "ollama": return new ChatOllama({ ...common, baseUrl: config.baseURL, numPredict: sampling.maxTokens, headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}, ...(json ? { format: "json" } : {}) });
    case "mistral": return new ChatMistralAI({ ...common, apiKey, serverURL: config.baseURL });
    case "cohere": return new ChatCohere({ ...common, client: new CohereClient({ token: apiKey, environment: config.baseURL }) });
    case "bedrock": return new ChatBedrockConverse({ ...common, region: config.region || "us-east-1", bedrockBearerToken: config.apiKey || undefined, ...(config.baseURL ? { client: new BedrockRuntimeClient({ region: config.region, endpoint: config.baseURL, ...(config.apiKey ? { authSchemePreference: ["httpBearerAuth"], token: async () => ({ token: config.apiKey }) } : {}) }) } : {}) });
    case "azure": return new AzureChatOpenAI({ ...common, azureOpenAIApiKey: apiKey, azureOpenAIEndpoint: config.baseURL, azureOpenAIApiDeploymentName: model, azureOpenAIApiVersion: config.apiVersion, useResponsesApi: false });
    default: return new ChatOpenAI({ ...common, apiKey, configuration: { baseURL: config.baseURL }, useResponsesApi: false, streamUsage: false, ...(json ? { modelKwargs: { response_format: { type: "json_object" } } } : {}) });
  }
}

export function messageText(message: Pick<BaseMessage, "content">): string {
  return typeof message.content === "string" ? message.content : message.content.filter(block => block.type === "text").map(block => String(block.text || "")).join("");
}
