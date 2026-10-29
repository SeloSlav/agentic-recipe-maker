"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";

type Graph = { nodes: string[]; edges: { source: string; target: string; conditional: boolean; label?: string }[] };
type Architecture = { checkedAt: string; backend: string; models: Record<string, string>; graphs: Record<string, Graph>; tools: { name: string; description: string }[]; services: Record<string, { status: string; detail: string }> };
const details: Record<string, { title: string; text: string; source: string }> = {
  __start__: { title: "Request enters", text: "The API validates the request and passes its state into the compiled graph.", source: "app/api/chat/route.ts · app/api/generateRecipeDetails/route.ts" },
  agent: { title: "Baba decides", text: "The configured chat model receives the conversation, Baba’s system prompt, optional corpus context, and Pro memory. It either answers or requests structured tool calls.", source: "app/lib/chatGraph.ts" },
  tools: { title: "Tools run", text: "LangChain tool() definitions validate arguments with Zod, call the app’s handlers, and return results to the agent. The loop continues until Baba responds. Meal plans emit custom progress events.", source: "app/lib/chatToolsLangchain.ts · app/lib/chatTools.ts" },
  check_cache: { title: "Check recipe cache", text: "LangChain’s PGVectorStore searches recipe_embeddings. A cosine distance of at most 0.12 returns a cached recipe and ends the graph.", source: "app/lib/stores/recipeVectorStore.ts" },
  retrieve_corpus: { title: "Retrieve Balkan recipes", text: "Search balkan_recipe_corpus. A distance below 0.1 returns the recipe directly. Up to 3 matches below 0.3 become context for generation. A fresh database starts without the private corpus.", source: "app/lib/stores/balkanCorpusStore.ts · app/lib/recipeGraph.ts" },
  generate: { title: "Generate the recipe", text: "The configured recipe model generates JSON ingredients and directions, using corpus context when available. The graph validates the returned arrays.", source: "app/lib/recipeGraph.ts" },
  enrich: { title: "Enrich the result", text: "When generateAll is true: classify → summary → macros and pairings in parallel. Each step checks the enrichment_cache vector store first. skipMacroAndPairing omits those last two calls.", source: "app/lib/recipeGraph.ts · app/lib/callLLM.ts" },
  store_cache: { title: "Store the cache", text: "A newly generated, complete recipe is cached when generateAll is true. Cache hits and direct corpus matches skip generation and enrichment.", source: "app/lib/stores/recipeVectorStore.ts" },
  __end__: { title: "Return to the app", text: "The chat API streams progress and a final done event. The recipe API returns the recipe result. These diagrams show compiled topology, not live execution traces.", source: "app/lib/chatGraph.ts · app/lib/recipeGraph.ts" },
};
const stores = [
  ["recipe_embeddings", "Complete recipe cache", "≤ 0.12"],
  ["enrichment_cache", "Classification, summary, macros, pairings", "≤ 0.08 · filtered by type"],
  ["balkan_recipe_corpus", "Authentic recipe retrieval and RAG", "< 0.1 direct · < 0.3 context"],
  ["conversation_memory", "Past turns for Pro users", "≤ 0.35 · filtered by user"],
  ["recipe_index", "Similar saved recipes", "Cosine ranking"],
];

function Flow({ graph, selected, onSelect }: { graph: Graph; selected: string; onSelect: (id: string) => void }) {
  const order = ["__start__", "agent", "tools", "check_cache", "retrieve_corpus", "generate", "enrich", "store_cache", "__end__"];
  const nodes = [...graph.nodes].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const width = Math.max(nodes.length * 170, 680), height = 290;
  const positions = Object.fromEntries(nodes.map((id, index) => [id, { x: 35 + index * 170, y: 120 }]));
  return <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50/70">
    <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: nodes.length > 4 ? width : undefined, width: "100%" }} role="group" aria-label="Compiled graph. Select a node for its implementation details.">
      <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="#a8a29e" /></marker></defs>
      {graph.edges.map((edge, index) => {
        const a = positions[edge.source], b = positions[edge.target];
        if (!a || !b) return null;
        const adjacent = b.x - a.x === 170;
        const d = adjacent ? `M${a.x + 130},${a.y + 28} L${b.x - 4},${b.y + 28}` : `M${a.x + 65},${a.y} C${a.x + 65},${30 + index % 3 * 15} ${b.x + 65},${30 + index % 3 * 15} ${b.x + 65},${b.y - 4}`;
        return <g key={`${edge.source}-${edge.target}`}><path d={d} fill="none" stroke="#a8a29e" strokeWidth="1.6" strokeDasharray={edge.conditional ? "5 4" : undefined} markerEnd="url(#arrow)" /><title>{edge.source} → {edge.target}{edge.conditional ? " (conditional)" : ""}</title></g>;
      })}
      {nodes.map(id => <g key={id} role="button" tabIndex={0} aria-label={`Inspect ${details[id]?.title || id}`} aria-pressed={selected === id} onClick={() => onSelect(id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } }} className="cursor-pointer outline-amber-700">
        <rect x={positions[id].x} y={positions[id].y} width="130" height="56" rx="12" fill={selected === id ? "#78350f" : "white"} stroke={selected === id ? "#78350f" : "#d6d3d1"} />
        <text x={positions[id].x + 65} y={positions[id].y + 33} textAnchor="middle" fontSize="12" fontFamily="monospace" fill={selected === id ? "white" : "#44403c"}>{id}</text>
      </g>)}
      <text x="35" y="255" fill="#78716c" fontSize="12">Solid: next step · Dashed: conditional branch · Select a node to inspect</text>
    </svg>
  </div>;
}

export default function AIArchitecturePage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<Architecture | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("chat");
  const [selected, setSelected] = useState("agent");
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/ai", { headers: { Authorization: `Bearer ${await user.getSessionToken()}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load architecture");
      setData(result);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load architecture"); }
    finally { setBusy(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  const detail = details[selected];
  return <main className="min-h-screen bg-[#faf8f4] text-stone-800 px-4 py-12 sm:px-8">
    <div className="mx-auto max-w-7xl">
      <Link href="/admin" className="text-sm text-amber-800 hover:underline">← Admin dashboard</Link>
      <header className="mt-8 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-800">Baba Selo · under the hood</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">How Baba thinks</h1><p className="mt-3 max-w-2xl text-stone-600">Explore the LangGraph workflows, LangChain tools, and data behind your cooking companion.</p></div>
        {data && <button onClick={load} disabled={busy} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-50">{busy ? "Checking…" : "Refresh status"}</button>}
      </header>
      {loading || (busy && !data) ? <p role="status">Loading architecture…</p> : !user ? <div className="rounded-2xl bg-white border p-6"><p>Sign in with an admin account to view the architecture.</p><Link href="/login" className="mt-3 inline-block text-amber-800 underline">Sign in</Link></div> : null}
      {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error} <button onClick={load} className="ml-2 underline">Retry</button></p>}
      {data && <>
        <section aria-label="Backend status" className="grid gap-3 sm:grid-cols-3 mb-8">
          {Object.entries(data.services).map(([key, service]) => <div key={key} className="rounded-2xl border border-stone-200 bg-white p-5"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${service.status === "ready" ? "bg-emerald-600" : service.status === "configured" ? "bg-sky-600" : "bg-amber-500"}`} /><span className="text-xs uppercase tracking-wider font-semibold">{key === "documents" ? data.backend : key}</span><span className="ml-auto text-xs text-stone-500">{service.status}</span></div><p className="mt-3 text-sm text-stone-600">{service.detail}</p></div>)}
        </section>
        <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Workflow explorer</h2><div role="tablist" aria-label="AI workflow" className="flex rounded-xl bg-stone-100 p-1">{["chat", "recipe"].map(id => <button key={id} role="tab" aria-selected={tab === id} aria-controls="workflow-panel" onClick={() => { setTab(id); setSelected(id === "chat" ? "agent" : "check_cache"); }} className={`rounded-lg px-4 py-2 text-sm ${tab === id ? "bg-white shadow-sm text-amber-900" : "text-stone-500"}`}>{id === "chat" ? "Chat agent" : "Recipe pipeline"}</button>)}</div></div>
          <p className="mt-3 mb-5 text-sm text-stone-500">Read from the actual compiled graph. This is an architecture view; it does not run AI calls or show execution traces.</p>
          <div id="workflow-panel" role="tabpanel"><Flow graph={data.graphs[tab]} selected={selected} onSelect={setSelected} /></div>
          {detail && <div className="mt-5 rounded-2xl bg-amber-50 p-5"><h3 className="font-semibold text-amber-950">{detail.title}</h3><p className="mt-2 text-sm leading-6 text-amber-950/80">{detail.text}</p><p className="mt-3 font-mono text-xs text-amber-800 break-words">{detail.source}</p></div>}
          <details className="mt-5 text-sm"><summary className="cursor-pointer text-stone-600">Inspect graph edges ({data.graphs[tab].edges.length})</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.graphs[tab].edges.map(e => <li key={`${e.source}-${e.target}`} className="rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs">{e.source} → {e.target}{e.conditional ? " · conditional" : ""}</li>)}</ul></details>
        </section>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <section className="rounded-3xl border border-stone-200 bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Baba’s toolkit</h2><span className="text-sm text-stone-500">{data.tools.length} registered tools</span></div><label className="mt-4 block"><span className="sr-only">Search tools</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a tool…" className="w-full rounded-xl border border-stone-200 px-4 py-2 text-sm focus:outline-amber-700" /></label><div className="mt-4 max-h-[450px] overflow-y-auto divide-y divide-stone-100">{data.tools.filter(t => `${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase())).map(t => <details key={t.name} className="py-3"><summary className="font-mono text-sm cursor-pointer text-amber-900">{t.name}</summary><p className="mt-2 text-sm leading-6 text-stone-600">{t.description}</p></details>)}{!data.tools.some(t => `${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase())) && <p className="py-4 text-sm text-stone-500">No tools match your search.</p>}</div></section>
          <div className="space-y-6"><section className="rounded-3xl border border-stone-200 bg-white p-6"><h2 className="text-xl font-semibold">Models</h2><p className="mt-2 mb-4 text-sm text-stone-500">Configured through .env.local and app/lib/ai-config.ts</p><dl className="space-y-3">{Object.entries(data.models).map(([key, value]) => <div key={key} className="flex flex-wrap gap-2 justify-between text-sm"><dt className="text-stone-500">{key}</dt><dd className="font-mono">{value}</dd></div>)}</dl></section><section className="rounded-3xl border border-stone-200 bg-white p-6"><h2 className="text-xl font-semibold">Where state lives</h2><p className="mt-3 text-sm leading-6 text-stone-600">{data.backend} stores users, recipes, chats, meal plans, and spoon points. PostgreSQL/pgvector stores embeddings for semantic retrieval. LangGraph orchestrates the work; LangChain supplies models, messages, tools, and vector stores.</p><p className="mt-3 text-sm leading-6 text-stone-600">Meal planning, enrichment, and photo analysis use the selected provider adapter. Optional image generation and transcription use OpenAI. Tool-invoked operations are not separate LangGraph nodes.</p></section></div>
        </div>
        <section className="mt-6 overflow-hidden rounded-3xl border border-stone-200 bg-white p-6"><h2 className="text-xl font-semibold mb-5">Semantic stores · PostgreSQL + pgvector</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-stone-500"><th className="pb-3 font-medium">Table</th><th className="pb-3 font-medium">Purpose</th><th className="pb-3 font-medium">Cosine distance</th></tr></thead><tbody>{stores.map(([table, purpose, threshold]) => <tr key={table} className="border-b last:border-0 border-stone-100"><td className="py-4 pr-4 font-mono text-xs text-amber-900">{table}</td><td className="py-4 pr-4">{purpose}</td><td className="py-4 text-stone-500">{threshold}</td></tr>)}</tbody></table></div></section>
        <p className="mt-6 text-xs text-stone-400">Status checked {new Date(data.checkedAt).toLocaleString()} · Inspecting this page does not contact AI providers.</p>
      </>}
    </div>
  </main>;
}
