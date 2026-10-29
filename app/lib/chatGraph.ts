/**
 * LangGraph chat agent for Baba Selo.
 * Uses a ReAct agent with streaming support for tool progress events.
 */
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { MODELS } from "./models";
import { createBabaChatTools } from "./chatToolsLangchain";

const chatModel = new ChatOpenAI({
  model: MODELS.chat,
  temperature: 1.0,
  maxTokens: 1500,
});

export interface ChatGraphInput {
  messages: { role: string; content: string }[];
  systemPrompt: string;
  userId: string;
}

export interface ChatGraphOutput {
  assistantMessage: string;
  timerSeconds?: number;
  lastMealPlanId?: string | null;
}

function toLangChainMessages(
  messages: { role: string; content: string }[]
): BaseMessage[] {
  return messages.map((m) => {
    if (m.role === "user") return new HumanMessage(m.content);
    if (m.role === "assistant") return new AIMessage(m.content);
    return new SystemMessage(m.content);
  });
}

function extractChatResult(messages: BaseMessage[]): ChatGraphOutput {
  const lastAIMessage = [...messages]
    .reverse()
    .find((m) => m._getType() === "ai") as AIMessage | undefined;

  let assistantMessage = "I'm sorry, I couldn't respond.";
  if (lastAIMessage?.content) {
    if (typeof lastAIMessage.content === "string") {
      assistantMessage = lastAIMessage.content;
    } else if (Array.isArray(lastAIMessage.content)) {
      assistantMessage = (
        lastAIMessage.content as { type?: string; text?: string }[]
      )
        .filter((c) => c?.type === "text")
        .map((c) => c.text ?? "")
        .join("");
    }
  }

  let timerSeconds: number | undefined;
  let lastMealPlanId: string | null = null;

  for (const msg of messages) {
    if (msg._getType() === "tool") {
      try {
        const content =
          typeof msg.content === "string" ? msg.content : "";
        const parsed = JSON.parse(content);
        if (parsed.seconds) timerSeconds = parsed.seconds;
        if (parsed.planId) lastMealPlanId = parsed.planId;
      } catch {
        /* ignore unparseable tool results */
      }
    }
  }

  return {
    assistantMessage,
    ...(timerSeconds != null && { timerSeconds }),
    ...(lastMealPlanId && { lastMealPlanId }),
  };
}

export function createChatAgent(userId: string, systemPrompt: string) {
  const tools = createBabaChatTools(userId);

  return createReactAgent({
    llm: chatModel,
    tools,
    prompt: new SystemMessage(systemPrompt),
  });
}

export async function runChatGraph(
  input: ChatGraphInput
): Promise<ChatGraphOutput> {
  const { messages, systemPrompt, userId } = input;
  const agent = createChatAgent(userId, systemPrompt);

  const result = await agent.invoke({
    messages: toLangChainMessages(messages),
  });

  return extractChatResult(result?.messages ?? []);
}

export type MealPlanProgressPayload = {
  recipeIndex: number;
  totalRecipes: number;
  recipeName: string;
  dayName: string;
  completedDays: number;
  timeSlot: string;
};

export type ChatStreamEvent =
  | { type: "tool_started"; tool: string }
  | {
      type: "meal_plan_progress";
      recipeIndex: number;
      totalRecipes: number;
      recipeName: string;
      dayName: string;
      completedDays: number;
      timeSlot: string;
    }
  | {
      type: "done";
      assistantMessage: string;
      timerSeconds?: number;
      lastMealPlanId?: string | null;
    };

/**
 * Stream the chat agent, emitting tool_started when generate_meal_plan begins.
 * Yields events for the frontend to show the meal plan loader.
 */
export async function* runChatGraphStream(
  input: ChatGraphInput
): AsyncGenerator<ChatStreamEvent, ChatGraphOutput, unknown> {
  const { messages, systemPrompt, userId } = input;
  const agent = createChatAgent(userId, systemPrompt);

  const stream = await agent.stream(
    { messages: toLangChainMessages(messages) },
    { streamMode: ["values", "custom"] as const }
  );

  let lastValue: { messages?: BaseMessage[] } = {};
  for await (const chunk of stream) {
    const arr = Array.isArray(chunk) ? chunk : [chunk];
    const mode =
      arr.length >= 2
        ? arr.length === 3
          ? arr[1]
          : arr[0]
        : "values";
    const data =
      arr.length >= 2
        ? arr.length === 3
          ? arr[2]
          : arr[1]
        : arr[0];

    if (mode === "custom" && data && typeof data === "object") {
      if (
        "tool" in data &&
        typeof (data as { tool: string }).tool === "string"
      ) {
        yield {
          type: "tool_started",
          tool: (data as { tool: string }).tool,
        };
      } else if (
        "type" in data &&
        (data as { type: string }).type === "meal_plan_progress"
      ) {
        const p = data as {
          type: string;
          recipeIndex?: number;
          totalRecipes?: number;
          recipeName?: string;
          dayName?: string;
          completedDays?: number;
          timeSlot?: string;
        };
        yield {
          type: "meal_plan_progress",
          recipeIndex: p.recipeIndex ?? 0,
          totalRecipes: p.totalRecipes ?? 0,
          recipeName: p.recipeName ?? "",
          dayName: p.dayName ?? "",
          completedDays: p.completedDays ?? 0,
          timeSlot: p.timeSlot ?? "",
        };
      }
    } else if (
      mode === "values" &&
      data &&
      typeof data === "object" &&
      "messages" in data
    ) {
      lastValue = data as { messages?: BaseMessage[] };
    }
  }

  const finalMessages = lastValue?.messages ?? [];
  const result = extractChatResult(finalMessages);

  yield {
    type: "done",
    assistantMessage: result.assistantMessage,
    timerSeconds: result.timerSeconds,
    lastMealPlanId: result.lastMealPlanId,
  };
  return result;
}
