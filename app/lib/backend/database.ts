/** Document API for the app's private SpacetimeDB tables. */
import { encode, fieldValue, type Constraint, type Operation, type Write } from "./protocol";
import { backendRequest } from "local-data-request";
import { Timestamp } from "./timestamp";
export { Timestamp } from "./timestamp";

export type DocumentData = Record<string, any>;
export type QueryConstraint = Constraint;
export const db = { backend: "spacetimedb" } as const;
export interface DocumentReference<T extends DocumentData = DocumentData> {
  path: string;
  id: string;
  kind: "doc" | "collection";
  constraints: Constraint[];
}
export interface DocumentSnapshot<T extends DocumentData = DocumentData> {
  id: string;
  ref: DocumentReference<T>;
  exists(): boolean;
  data(): T | undefined;
  get(field: string): any;
}
export interface QueryDocumentSnapshot<T extends DocumentData = DocumentData> extends DocumentSnapshot<T> { data(): T; }
export interface QuerySnapshot<T extends DocumentData = DocumentData> {
  docs: QueryDocumentSnapshot<T>[];
  size: number;
  empty: boolean;
  forEach(fn: (document: QueryDocumentSnapshot<T>) => void): void;
}
type ReferenceParent = { path?: string; backend?: string };
function reference(kind: DocumentReference["kind"], parent: ReferenceParent, segments: string[]): DocumentReference {
  const path = [parent?.path, ...segments].filter(Boolean).join("/");
  return { kind, path, id: path.split("/").pop()!, constraints: [] };
}
export function decode(value: any): any {
  if (value == null) return value;
  if (typeof value === "object" && "__localTimestamp" in value) return Timestamp.fromMillis(value.__localTimestamp);
  if (Array.isArray(value)) return value.map(decode);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  return value;
}
const request = (op: Operation): Promise<any> => backendRequest(encode(op));
function snapshot(path: string, data: any): DocumentSnapshot {
  return { id: path.split("/").pop()!, ref: reference("doc", null, [path]), exists: () => data != null, data: () => decode(data) ?? undefined, get: field => decode(fieldValue(data, field)) };
}
export const getDatabase = () => db;
export const doc = (parent: ReferenceParent, ...segments: string[]) => reference("doc", parent, segments.length ? segments : [crypto.randomUUID()]);
export const collection = (parent: ReferenceParent, ...segments: string[]) => reference("collection", parent, segments);
export const query = (ref: DocumentReference, ...constraints: Constraint[]): DocumentReference => ({ ...ref, constraints: [...ref.constraints, ...constraints] });
export const where = (field: string, op: string, value: any): Constraint => ({ kind: "where", field, op, value });
export const orderBy = (field: string, direction = "asc"): Constraint => ({ kind: "orderBy", field, direction });
export const limit = (value: number): Constraint => ({ kind: "limit", value });
export const startAfter = (cursor: DocumentSnapshot | null): Constraint => ({ kind: "startAfter", value: cursor ? { path: cursor.ref.path, data: encode(cursor.data()) } : null });
export async function getDoc<T extends DocumentData = DocumentData>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  return snapshot(ref.path, (await request({ action: "get", path: ref.path })).data) as DocumentSnapshot<T>;
}
export async function getDocs<T extends DocumentData = DocumentData>(ref: DocumentReference<T>): Promise<QuerySnapshot<T>> {
  const rows = await request({ action: "query", path: ref.path, constraints: ref.constraints });
  const docs: QueryDocumentSnapshot<T>[] = rows.map((row: any) => snapshot(row.path, row.data));
  return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) };
}
export async function getCountFromServer(ref: DocumentReference) {
  const result = await getDocs(ref); return { data: () => ({ count: result.size }) };
}
const write = (item: Write): Promise<void> => request({ action: "write", writes: [item] }).then(() => undefined);
export const setDoc = (ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }) => write({ path: ref.path, mode: "set", data, merge: options?.merge });
export const updateDoc = (ref: DocumentReference, data: DocumentData) => write({ path: ref.path, mode: "update", data });
export const deleteDoc = (ref: DocumentReference) => write({ path: ref.path, mode: "delete" });
export async function addDoc(ref: DocumentReference, data: DocumentData) { const next = doc(ref); await setDoc(next, data); return next; }
const transform = (op: string, value?: any) => ({ __localTransform: op, value });
export const serverTimestamp = () => transform("timestamp");
export const increment = (value: number) => transform("increment", value);
export const arrayUnion = (...values: any[]) => transform("union", values);
export const arrayRemove = (...values: any[]) => transform("remove", values);
export const deleteField = () => transform("delete");
export function writeBatch(_database = db) {
  const writes: Write[] = [];
  const batch = {
    set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }) { writes.push({ path: ref.path, mode: "set", data, merge: options?.merge }); return batch; },
    update(ref: DocumentReference, data: DocumentData) { writes.push({ path: ref.path, mode: "update", data }); return batch; },
    delete(ref: DocumentReference) { writes.push({ path: ref.path, mode: "delete" }); return batch; },
    commit: () => request({ action: "write", writes }),
  };
  return batch;
}
export function onSnapshot(ref: DocumentReference, next: (snapshot: any) => void, error?: (error: unknown) => void) {
  let stopped = false, timer: ReturnType<typeof setTimeout>, previous: string;
  const poll = async () => {
    try {
      const result = ref.kind === "doc" ? await getDoc(ref) : await getDocs(ref);
      const serialized = JSON.stringify("docs" in result ? result.docs.map(d => [d.id, d.data()]) : result.data());
      if (!stopped && serialized !== previous) { previous = serialized; next(result); }
    } catch (err) { if (!stopped) error?.(err); }
    if (!stopped) timer = setTimeout(poll, 1500);
  };
  void poll(); return () => { stopped = true; clearTimeout(timer); };
}
