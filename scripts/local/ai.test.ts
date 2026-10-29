import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { createServer as createHTTP2Server, type ServerHttp2Session } from "node:http2";
import { once } from "node:events";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AI_PROVIDERS, getAIConfig, getPublicAIStatus } from "../../app/lib/ai-config";
import { createChatModel, messageText } from "../../app/lib/ai-model";
import { createEmbeddings, resolveVectorTableName } from "../../app/lib/ai-embeddings";
import { lazyAIClient } from "../../app/lib/ai-client";

test("provider credentials are isolated and diagnostics never expose keys or endpoints", () => {
  const config = getAIConfig({ AI_PROVIDER: "anthropic", AI_MODEL: "test", OPENAI_API_KEY: "private-openai" });
  assert.equal(config.configured, false);
  assert.equal(config.apiKey, "");
  assert.equal(config.embeddings.configured, false);
  const env = { AI_PROVIDER: "anthropic", AI_MODEL: "test", ANTHROPIC_API_KEY: "private-claude", AI_BASE_URL: "https://private.example/api", OPENAI_API_KEY: "private-openai", AI_EMBEDDING_PROVIDER: "ollama" };
  const mixed = getAIConfig(env);
  assert.equal(mixed.configured, true);
  assert.equal(mixed.embeddings.configured, true);
  assert.equal(mixed.embeddings.apiKey, "");
  const publicStatus = JSON.stringify(getPublicAIStatus(env));
  for (const secret of ["private-claude", "private-openai", "private.example"]) assert.ok(!publicStatus.includes(secret));
  assert.equal(getAIConfig({ AI_PROVIDER: "ollama" }).configured, true);
  assert.equal(getAIConfig({ AI_PROVIDER: "ollama", AI_BASE_URL: "https://remote.example" }).configured, false);
  assert.equal(getAIConfig({ AI_PROVIDER: "__proto__" }).configured, false);
  assert.equal(getAIConfig({ AI_BASE_URL: "https://user:secret@example.com" }).configured, false);
  assert.equal(getAIConfig({ AI_PROVIDER: "groq", GROQ_API_KEY: "test" }).configured, false, "hosted providers require an explicit model");
  assert.equal(getAIConfig({ AI_PROVIDER: "bedrock", AI_MODEL: "test", AWS_REGION: "eu-west-1" }).configured, true);
  for (const provider of Object.keys(AI_PROVIDERS)) {
    const c = getAIConfig({ AI_PROVIDER: provider, AI_MODEL: "test", AI_API_KEY: "test", AWS_REGION: "eu-west-1", ...(provider === "azure" || provider === "openai-compatible" ? { AI_BASE_URL: "https://example.com" } : {}) });
    assert.equal(c.configured, true, provider);
    assert.ok(createChatModel("chat", {}, c).bindTools, `${provider} supports tool binding`);
  }
});

test("embedding spaces are isolated by provider, endpoint, region and model", () => {
  const old = getAIConfig({ OPENAI_API_KEY: "test" });
  assert.equal(resolveVectorTableName("recipe_index", old), "recipe_index");
  const local = getAIConfig({ AI_PROVIDER: "ollama" });
  const other = getAIConfig({ AI_PROVIDER: "ollama", AI_EMBEDDING_MODEL: "other" });
  assert.notEqual(resolveVectorTableName("recipe_index", local), resolveVectorTableName("recipe_index", other));
  assert.match(resolveVectorTableName("recipe_index", local), /^recipe_index_[a-f0-9]{12}$/);
  assert.throws(() => resolveVectorTableName("invalid; DROP TABLE recipes"));
  assert.equal(createEmbeddings(getAIConfig({ AI_PROVIDER: "anthropic", AI_MODEL: "test", ANTHROPIC_API_KEY: "test" })), null);
});

async function readBody(request: IncomingMessage) {
  let raw = ""; for await (const chunk of request) raw += chunk; return JSON.parse(raw || "{}");
}
const reply = "Your recipe is ready.";
const echoTool = tool(({ value }) => `tool_output:${value}`, { name: "echo", description: "Echo a value", schema: z.object({ value: z.string() }) });

/** Real SDKs and LangGraph run against protocol fixtures; no cloud keys or model download. */
async function withServer(work: (baseURL: string, requests: { path: string; body: any; headers: IncomingMessage["headers"] }[]) => Promise<void>, http2 = false) {
  const requests: { path: string; body: any; headers: IncomingMessage["headers"] }[] = [];
  const handler = async (req: IncomingMessage, res: any) => {
    const path = req.url!, body = await readBody(req); requests.push({ path, body, headers: req.headers });
    const hasResult = JSON.stringify(body).includes("tool_output:");
    const callTool = Boolean(body.tools?.length || body.toolConfig) && !hasResult;
    const args = { value: "local-test" };
    const text = body.model === "json-test" || path.includes("json-test") ? '```json\n{"recipe":"beans"}\n```' : reply;
    res.setHeader("Content-Type", "application/json");
    if (path.includes("embedContent")) return res.end(JSON.stringify({ embedding: { values: [1, 0, 0] } }));
    if (path.endsWith("/api/embed")) return res.end(JSON.stringify({ embeddings: (Array.isArray(body.input) ? body.input : [body.input]).map(() => [1, 0, 0]) }));
    if (path.includes("/embeddings")) return res.end(JSON.stringify({ id: "embed_test", object: "list", model: body.model, usage: { prompt_tokens: 2, total_tokens: 2 }, data: (Array.isArray(body.input) ? body.input : [body.input]).map((_: unknown, index: number) => ({ embedding: [1, 0, 0], index })) }));
    if (path.endsWith("/embed")) return res.end(JSON.stringify({ id: "embed_test", response_type: "embeddings_floats", texts: body.texts, embeddings: body.texts.map(() => [1, 0, 0]) }));
    if (path.endsWith("/invoke")) return res.end(JSON.stringify({ embedding: [1, 0, 0], inputTextTokenCount: 2 }));
    if (path.includes("/anthropic/")) return res.end(JSON.stringify({ id: `msg_${requests.length}`, type: "message", role: "assistant", model: "test", content: callTool ? [{ type: "tool_use", id: "call_test", name: "echo", input: args }] : [{ type: "text", text }], stop_reason: callTool ? "tool_use" : "end_turn", usage: { input_tokens: 2, output_tokens: 3 } }));
    if (path.includes("generateContent")) return res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: callTool ? [{ functionCall: { name: "echo", args } }] : [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 } }));
    if (path.endsWith("/api/chat")) {
      res.setHeader("Content-Type", "application/x-ndjson");
      return res.end(JSON.stringify({ model: body.model, created_at: new Date().toISOString(), message: { role: "assistant", content: callTool ? "" : text, ...(callTool ? { tool_calls: [{ function: { name: "echo", arguments: args } }] } : {}) }, done: true, done_reason: "stop", prompt_eval_count: 2, eval_count: 3 }) + "\n");
    }
    if (path.includes("/cohere/")) return res.end(JSON.stringify({ response_id: "test", generation_id: "test", text: callTool ? "" : text, finish_reason: callTool ? "TOOL_CALL" : "COMPLETE", ...(callTool ? { tool_calls: [{ name: "echo", parameters: args }] } : {}), meta: { tokens: { input_tokens: 2, output_tokens: 3 } } }));
    if (path.includes("/converse")) return res.end(JSON.stringify({ output: { message: { role: "assistant", content: callTool ? [{ toolUse: { toolUseId: "call_test", name: "echo", input: args } }] : [{ text }] } }, stopReason: callTool ? "tool_use" : "end_turn", usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }, metrics: { latencyMs: 1 } }));
    if (body.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      const chunk = { id: `test_${requests.length}`, object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, finish_reason: callTool ? "tool_calls" : "stop", delta: { role: "assistant", content: callTool ? "" : text, ...(callTool ? { tool_calls: [{ index: 0, id: "call_test", type: "function", function: { name: "echo", arguments: JSON.stringify(args) } }] } : {}) } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } };
      return res.end(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
    }
    return res.end(JSON.stringify({ id: `test_${requests.length}`, object: "chat.completion", created: 1, model: body.model, choices: [{ index: 0, finish_reason: callTool ? "tool_calls" : "stop", message: { role: "assistant", content: callTool ? null : text, ...(callTool ? { tool_calls: [{ id: "call_test", type: "function", function: { name: "echo", arguments: JSON.stringify(args) } }] } : {}) } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }));
  };
  const server = http2 ? createHTTP2Server(handler as any) : createServer(handler);
  const sessions = new Set<ServerHttp2Session>();
  server.on("session", session => sessions.add(session));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try { await work(`http://127.0.0.1:${(server.address() as { port: number }).port}`, requests); }
  finally { if ("closeAllConnections" in server) server.closeAllConnections(); for (const session of sessions) session.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

for (const provider of ["openai", "anthropic", "google", "ollama", "mistral", "cohere", "azure", "bedrock"]) {
  test(`${provider}: native request, tool execution, result round-trip and final answer`, async () => {
    const previous = { id: process.env.AWS_ACCESS_KEY_ID, secret: process.env.AWS_SECRET_ACCESS_KEY };
    process.env.AWS_ACCESS_KEY_ID = "test"; process.env.AWS_SECRET_ACCESS_KEY = "test";
    try { await withServer(async (url, requests) => {
      const config = getAIConfig({ AI_PROVIDER: provider, AI_MODEL: "test", AI_API_KEY: provider === "bedrock" ? undefined : "test-provider-key", AI_BASE_URL: `${url}/${provider}`, AWS_REGION: "us-east-1" });
      const model = createChatModel("chat", { temperature: 0, maxTokens: 500 }, config);
      const result = await createReactAgent({ llm: model, tools: [echoTool] }).invoke({ messages: [{ role: "user", content: "Echo local-test" }] });
      assert.equal(messageText(result.messages.at(-1)!), reply);
      assert.ok(result.messages.some(m => m.getType() === "tool" && m.content === "tool_output:local-test"));
      assert.equal(requests.length, 2);
      assert.ok(JSON.stringify(requests[0].body).includes('"echo"'));
      assert.ok(JSON.stringify(requests[1].body).includes("tool_output:local-test"));
      if (provider === "anthropic") assert.equal(requests[0].headers["x-api-key"], "test-provider-key");
      if (provider === "google") assert.equal(requests[0].headers["x-goog-api-key"], "test-provider-key");
    }, provider === "bedrock"); } finally {
      for (const [key, value] of [["AWS_ACCESS_KEY_ID", previous.id], ["AWS_SECRET_ACCESS_KEY", previous.secret]]) { if (value === undefined) delete process.env[key!]; else process.env[key!] = value; }
    }
  });
}

for (const provider of ["openai", "ollama", "google", "mistral", "cohere", "azure", "bedrock"]) {
  test(`${provider}: native query and document embeddings`, async () => {
    process.env.AWS_ACCESS_KEY_ID = "test"; process.env.AWS_SECRET_ACCESS_KEY = "test";
    try { await withServer(async (url, requests) => {
      const config = getAIConfig({ AI_PROVIDER: provider, AI_MODEL: "test", AI_API_KEY: provider === "bedrock" ? undefined : "test", AI_BASE_URL: `${url}/${provider}`, AI_EMBEDDING_PROVIDER: provider, AI_EMBEDDING_MODEL: "test", AWS_REGION: "us-east-1" });
      const embeddings = createEmbeddings(config)!;
      assert.deepEqual(await embeddings.embedQuery("beans"), [1, 0, 0]);
      assert.deepEqual(await embeddings.embedDocuments(["beans", "soup"]), [[1, 0, 0], [1, 0, 0]]);
      if (provider === "google") assert.equal(requests[0].body.taskType, "RETRIEVAL_QUERY");
      if (provider === "cohere") { assert.equal(requests[0].body.input_type, "search_query"); assert.equal(requests[1].body.input_type, "search_document"); }
    }, provider === "bedrock"); } finally { delete process.env.AWS_ACCESS_KEY_ID; delete process.env.AWS_SECRET_ACCESS_KEY; }
  });
}

for (const provider of ["openai", "anthropic", "google", "ollama", "mistral", "cohere", "azure", "bedrock"]) test(`${provider}: app completion facade normalizes JSON and native content blocks`, async () => {
  const old = { ...process.env };
  try { await withServer(async url => {
    delete process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = provider; process.env.AI_BASE_URL = `${url}/${provider}`; process.env.AI_MODEL = "json-test";
    process.env.AI_API_KEY = provider === "bedrock" || provider === "ollama" ? "" : "test";
    process.env.AWS_REGION = "us-east-1"; process.env.AWS_ACCESS_KEY_ID = "test"; process.env.AWS_SECRET_ACCESS_KEY = "test"; delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    const result = await lazyAIClient().chat.completions.create({ model: "json-test", response_format: { type: "json_object" }, messages: [{ role: "system", content: "You are a chef." }, { role: "user", content: "Make a recipe" }] });
    assert.deepEqual(JSON.parse(result.choices[0].message.content), { recipe: "beans" });
  }, provider === "bedrock"); } finally { for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key]; Object.assign(process.env, old); }
});
