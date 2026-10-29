import { schema, table, t, SenderError } from "spacetimedb/server";

// Private documents preserve existing collection paths, including subcollections.
// Only the Next server's database-owner identity may read or mutate these rows.
const document = table({ public: false }, {
  path: t.string().primaryKey(),
  collection: t.string().index("btree"),
  json: t.string(),
});
const owner = table({ public: false }, { identity: t.identity().primaryKey() });
const spacetimedb = schema({ document, owner });
export default spacetimedb;
export const init = spacetimedb.init(ctx => { ctx.db.owner.insert({ identity: ctx.sender }); });

type Data = Record<string, any>;
function resolve(value: any, previous: any, now: number): any {
  if (!value || typeof value !== "object") return value;
  if (value.__localTransform) {
    const arr = Array.isArray(previous) ? previous : [];
    const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
    switch (value.__localTransform) {
      case "timestamp": return { __localTimestamp: now };
      case "increment": return (typeof previous === "number" ? previous : 0) + value.value;
      case "union": {
        const merged = [...arr];
        for (const v of value.value) if (!merged.some(p => same(p, v))) merged.push(v);
        return merged;
      }
      case "remove": return arr.filter(p => !value.value.some((v: any) => same(p, v)));
      case "delete": return undefined;
      default: throw new SenderError("Unknown field transform");
    }
  }
  if (Array.isArray(value)) return value.map(v => resolve(v, undefined, now));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, previous?.[k], now)]).filter(([, v]) => v !== undefined));
}

function patch(target: Data, data: Data, now: number, dotted: boolean) {
  for (const [key, value] of Object.entries(data)) {
    const parts = dotted ? key.split(".") : [key];
    if (parts.some(k => ["__proto__", "prototype", "constructor"].includes(k))) throw new SenderError("Invalid field");
    let parent = target;
    for (const part of parts.slice(0, -1)) {
      if (!parent[part] || typeof parent[part] !== "object" || Array.isArray(parent[part])) parent[part] = {};
      parent = parent[part];
    }
    const last = parts[parts.length - 1];
    const next = resolve(value, parent[last], now);
    if (next === undefined) delete parent[last]; else parent[last] = next;
  }
}

export const commit = spacetimedb.reducer({ operations: t.string() }, (ctx, { operations }) => {
  if (!ctx.db.owner.identity.find(ctx.sender)) throw new SenderError("Only the database owner can write");
  const writes = JSON.parse(operations) as { path: string; mode: string; data?: Data; merge?: boolean }[];
  if (!Array.isArray(writes) || writes.length > 500) throw new SenderError("Invalid batch");
  const now = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
  for (const write of writes) {
    const parts = write.path.split("/");
    if (parts.length % 2 || parts.some(p => !p || p === "." || p === "..")) throw new SenderError("Invalid document path");
    const existing = ctx.db.document.path.find(write.path);
    if (write.mode === "delete") { if (existing) ctx.db.document.path.delete(write.path); continue; }
    if (!["set", "update"].includes(write.mode)) throw new SenderError("Unknown write mode");
    if (write.mode === "update" && !existing) throw new SenderError("Document does not exist");
    const data = existing ? JSON.parse(existing.json) : {};
    let result: Data;
    if (write.mode === "set" && !write.merge) result = resolve(write.data ?? {}, undefined, now);
    else { result = data; patch(result, write.data ?? {}, now, write.mode === "update"); }
    const row = { path: write.path, collection: parts.slice(0, -1).join("/"), json: JSON.stringify(result) };
    if (existing) ctx.db.document.path.update(row); else ctx.db.document.insert(row);
  }
});
