export type Constraint = { kind: string; field?: string; op?: string; value?: any; direction?: string };
export type Write = { path: string; mode: "set" | "update" | "delete"; data?: any; merge?: boolean };
export type Operation = { action: "get" | "query" | "write"; path?: string; constraints?: Constraint[]; writes?: Write[] };

export function encode(value: any): any {
  if (value == null) return value;
  if (value instanceof Date) return { __localTimestamp: value.getTime() };
  if (typeof value.toMillis === "function") return { __localTimestamp: value.toMillis() };
  if (Array.isArray(value)) return value.map(encode);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]));
  return value;
}

export function fieldValue(data: any, field: string): any {
  return field.split(".").reduce((v, key) => v?.[key], data);
}

const comparable = (v: any) => v && typeof v === "object" && "__localTimestamp" in v ? v.__localTimestamp : v;
const equal = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

/** Query semantics used by the app; filtering happens on the local Next server. */
export function selectRows(rows: { path: string; data: any }[], constraints: Constraint[] = []) {
  let result = rows.filter(row => constraints.filter(c => c.kind === "where").every(c => {
    const a = comparable(c.field === "__name__" ? row.path.split("/").pop() : fieldValue(row.data, c.field!));
    const b = comparable(c.value);
    switch (c.op) {
      case "==": return equal(a, b);
      case "!=": return a !== undefined && !equal(a, b);
      case "<": return a < b;
      case "<=": return a <= b;
      case ">": return a > b;
      case ">=": return a >= b;
      case "in": return b.some((v: any) => equal(a, v));
      case "not-in": return a !== undefined && !b.some((v: any) => equal(a, v));
      case "array-contains": return Array.isArray(a) && a.some(v => equal(v, b));
      case "array-contains-any": return Array.isArray(a) && b.some((v: any) => a.some(x => equal(x, v)));
      default: throw new Error(`Unsupported query operator: ${c.op}`);
    }
  }));
  const ordering = constraints.filter(c => c.kind === "orderBy");
  result = result.filter(r => ordering.every(o => fieldValue(r.data, o.field!) !== undefined));
  const compare = (a: typeof rows[number], b: typeof rows[number]) => {
    for (const o of ordering) {
      const x = comparable(fieldValue(a.data, o.field!)), y = comparable(fieldValue(b.data, o.field!));
      if (x !== y) return (x < y ? -1 : 1) * (o.direction === "desc" ? -1 : 1);
    }
    return a.path.localeCompare(b.path);
  };
  result.sort(compare);
  const cursor = constraints.find(c => c.kind === "startAfter")?.value;
  if (cursor) result = result.filter(r => compare(r, cursor) > 0);
  const max = constraints.find(c => c.kind === "limit")?.value;
  return max == null ? result : result.slice(0, max);
}

