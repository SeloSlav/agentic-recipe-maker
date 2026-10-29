import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { selectRows, type Operation } from "./protocol";

export const localDirectory = () => path.resolve(process.cwd(), ".local");
const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

export async function spacetimeFetch(endpoint: string, init?: RequestInit) {
  const url = process.env.SPACETIMEDB_URL || "http://127.0.0.1:3100";
  const db = process.env.SPACETIMEDB_DATABASE || "baba-selo-local";
  const token = process.env.SPACETIMEDB_TOKEN || JSON.parse(await readFile(path.join(localDirectory(), "spacetime-owner.json"), "utf8")).token;
  const response = await fetch(`${url}/v1/database/${encodeURIComponent(db)}/${endpoint}`, {
    ...init, cache: "no-store", headers: { ...init?.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`SpacetimeDB ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response;
}

export async function executeOperation(op: Operation): Promise<any> {
  if (op.action === "write") {
    await spacetimeFetch("call/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([JSON.stringify(op.writes)]) });
    return { ok: true };
  }
  if (!op.path || !/^[\w\-./@]+$/.test(op.path) || op.path.split("/").some(p => !p || p === "..")) throw new Error("Invalid document path");
  const column = op.action === "get" ? "path" : "collection";
  const response = await spacetimeFetch("sql", { method: "POST", body: `SELECT path, json FROM document WHERE ${column} = ${sqlString(op.path)}` });
  const result = await response.json();
  const rows = (result[0]?.rows ?? []).map((row: string[]) => ({ path: row[0], data: JSON.parse(row[1]) }));
  if (op.action === "get") return { data: rows[0]?.data ?? null };
  if (op.action !== "query") throw new Error("Unknown operation");
  return selectRows(rows, op.constraints);
}
