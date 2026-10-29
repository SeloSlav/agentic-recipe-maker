import "server-only";
import { randomUUID } from "node:crypto";
import { executeOperation } from "./spacetime-server";
import { decode, Timestamp, serverTimestamp, increment, arrayUnion, arrayRemove, deleteField } from "./database";
import { verifyLocalToken, LOCAL_USER } from "./local-session";
import type { Constraint } from "./protocol";
import { encode } from "./protocol";

class Reference {
  constructor(readonly path: string, readonly constraints: Constraint[] = []) {}
  get id() { return this.path.split("/").pop()!; }
  doc(id: string = randomUUID()) { return new Reference(`${this.path}/${id}`); }
  collection(name: string) { return new Reference(`${this.path}/${name}`); }
  where(field: string, op: string, value: any) { return new Reference(this.path, [...this.constraints, { kind: "where", field, op, value }]); }
  orderBy(field: string, direction = "asc") { return new Reference(this.path, [...this.constraints, { kind: "orderBy", field, direction }]); }
  limit(value: number) { return new Reference(this.path, [...this.constraints, { kind: "limit", value }]); }
  async get(): Promise<any> {
    if (this.path.split("/").length % 2 === 0) {
      const result = await executeOperation({ action: "get", path: this.path });
      return this.snapshot(result.data);
    }
    const rows = await executeOperation(encode({ action: "query", path: this.path, constraints: this.constraints }));
    const docs = rows.map((r: any) => new Reference(r.path).snapshot(r.data));
    return { docs, size: docs.length, empty: !docs.length, forEach: (fn: any) => docs.forEach(fn) };
  }
  snapshot(data: any) { return { id: this.id, ref: this, exists: data != null, data: () => decode(data) }; }
  async set(data: any, options?: any) { await executeOperation(encode({ action: "write", writes: [{ path: this.path, mode: "set", data, merge: options?.merge }] })); }
  async update(data: any) { await executeOperation(encode({ action: "write", writes: [{ path: this.path, mode: "update", data }] })); }
  async delete() { await executeOperation({ action: "write", writes: [{ path: this.path, mode: "delete" }] }); }
  async add(data: any) { const ref = this.doc(); await ref.set(data); return ref; }
}
export const serverDb = {
  collection: (name: string) => new Reference(name),
  doc: (path: string) => new Reference(path),
  transforms: { serverTimestamp, increment, arrayUnion, arrayRemove, delete: deleteField },
  Timestamp,
};
export const serverAuth = {
  verifyToken: verifyLocalToken,
  async getUser(uid: string) {
    if (uid !== LOCAL_USER.uid) throw new Error("Unknown local user");
    return LOCAL_USER;
  },
};
