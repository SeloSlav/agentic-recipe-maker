import { NextResponse } from "next/server";
import { Pool } from "pg";
import { serverDb, serverAuth } from "../../../lib/backend/admin";
import { assertLocalRequest, requestToken } from "../../../lib/backend/local-session";
import { spacetimeFetch } from "../../../lib/backend/spacetime-server";
import { createChatAgent } from "../../../lib/chatGraph";
import { createRecipeGraph } from "../../../lib/recipeGraph";
import { createBabaChatTools } from "../../../lib/chatToolsLangchain";
import { MODELS } from "../../../lib/models";

export const dynamic = "force-dynamic";
function graphData(graph: any) {
  return { nodes: Object.keys(graph.nodes), edges: graph.edges.map((e: any) => ({ source: e.source, target: e.target, conditional: Boolean(e.conditional), label: typeof e.data === "string" ? e.data : null })) };
}
export async function GET(request: Request) {
  let uid: string;
  try {
    assertLocalRequest(request);
    const token = requestToken(request);
    if (!token) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    uid = (await serverAuth.verifyToken(token)).uid;
  } catch { return NextResponse.json({ error: "Invalid session" }, { status: 401 }); }
  try {
    const account = await serverDb.collection("admins").doc(uid).get();
    if (!account.exists || account.data()?.active !== true) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    const tools = createBabaChatTools(uid).map(tool => ({ name: tool.name, description: tool.description }));
    const chat = graphData(await createChatAgent(uid, "Architecture inspection only").getGraphAsync());
    const recipe = graphData(createRecipeGraph().getGraph());
    let postgres: { status: string; detail: string } = { status: "unconfigured", detail: "No PostgreSQL URL configured" };
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (connectionString) {
      const pool = new Pool({ connectionString, connectionTimeoutMillis: 2000, query_timeout: 2000 });
      try {
        const result = await pool.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
        postgres = result.rowCount ? { status: "ready", detail: `PostgreSQL connected · pgvector ${result.rows[0].extversion}` } : { status: "unavailable", detail: "PostgreSQL connected; vector extension missing" };
      } catch { postgres = { status: "unavailable", detail: "Cannot connect to PostgreSQL" }; }
      finally { await pool.end(); }
    }
    let documents = { status: "ready", detail: "SpacetimeDB connected · private documents" };
    try { await spacetimeFetch("sql", { method: "POST", body: "SELECT path FROM document LIMIT 1" }); }
    catch { documents = { status: "unavailable", detail: "Cannot connect to SpacetimeDB" }; }
    return NextResponse.json({
      checkedAt: new Date().toISOString(), backend: "SpacetimeDB + local files", models: MODELS,
      graphs: { chat, recipe }, tools,
      services: { documents, postgres, openai: { status: process.env.OPENAI_API_KEY ? "configured" : "unconfigured", detail: process.env.OPENAI_API_KEY ? "API key present · provider not contacted" : "Add OPENAI_API_KEY to enable AI" } },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Architecture inspection failed:", error);
    return NextResponse.json({ error: "Cannot load architecture. Check the local backend is running." }, { status: 503 });
  }
}
