import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { localDirectory } from "./spacetime-server";

export const LOCAL_USER = { uid: "local-developer", displayName: "Local Developer", email: "developer@localhost", photoURL: null };
export const COOKIE_NAME = "baba-local-session";

export function assertLocalRequest(request: Request) {
  const url = new URL(request.url);
  const hosts = ["localhost", "127.0.0.1", "[::1]"];
  // Next may normalize request.url to localhost even when the browser used 127.0.0.1.
  // Validate the actual Host header as well, and compare Origin against that host.
  const publicUrl = new URL(`${url.protocol}//${request.headers.get("host") || url.host}`);
  if (!hosts.includes(url.hostname) || !hosts.includes(publicUrl.hostname)) throw new Error("Local backend only accepts loopback requests");
  const origin = request.headers.get("origin");
  if (origin && origin !== publicUrl.origin) throw new Error("Cross-origin local request rejected");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Cross-site local request rejected");
}

async function signature(payload: string) {
  const key = await readFile(path.join(localDirectory(), "session-key"));
  return createHmac("sha256", key).update(payload).digest("base64url");
}
export async function issueLocalToken() {
  const payload = Buffer.from(JSON.stringify({ uid: LOCAL_USER.uid, exp: Date.now() + 7 * 86400000 })).toString("base64url");
  return `${payload}.${await signature(payload)}`;
}
export async function verifyLocalToken(token: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new Error("Invalid session");
  const expected = await signature(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("Invalid session");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (claims.uid !== LOCAL_USER.uid || claims.exp < Date.now()) throw new Error("Session expired");
  return { ...LOCAL_USER, ...claims };
}
export function requestToken(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer /, "") || request.headers.get("cookie")?.split("; ").find(c => c.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
}
export async function requireLocalSession(request: Request) {
  const token = requestToken(request);
  if (!token) throw new Error("Sign in with the local developer account first");
  return verifyLocalToken(token);
}
