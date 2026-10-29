import OpenAI from "openai";
/** Delay credential validation until an AI operation is actually requested. */
export function lazyOpenAI(options: ConstructorParameters<typeof OpenAI>[0] = {}): OpenAI {
  let client: OpenAI;
  return new Proxy({} as OpenAI, { get(_target, key) {
    if (!process.env.OPENAI_API_KEY) throw new Error("Add OPENAI_API_KEY to .env.local to enable AI features.");
    client ??= new OpenAI({ ...options, apiKey: process.env.OPENAI_API_KEY });
    const value = Reflect.get(client, key); return typeof value === "function" ? value.bind(client) : value;
  } });
}
