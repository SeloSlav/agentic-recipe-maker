import type { Operation } from "./protocol";
export async function backendRequest(op: Operation) {
  const response = await fetch("/api/local/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Local database request failed");
  return data;
}
