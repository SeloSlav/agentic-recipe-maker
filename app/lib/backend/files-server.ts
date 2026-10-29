import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { localDirectory } from "./spacetime-server";

export function filePath(key: string) {
  if (!key || key.includes("\\") || key.split("/").some(p => !p || p === "." || p === "..") || !/^[\w./-]+$/.test(key)) throw new Error("Invalid file path");
  const root = path.join(localDirectory(), "uploads");
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) throw new Error("Invalid file path");
  return resolved;
}
export const localFileUrl = (key: string) => `/api/local/files/${key.split("/").map(encodeURIComponent).join("/")}`;
export async function saveFile(key: string, bytes: Uint8Array, contentType: string) {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType)) throw new Error("Only raster images are supported");
  if (bytes.length > 20 * 1024 * 1024) throw new Error("Image exceeds 20 MB");
  const target = filePath(key); await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes); await writeFile(`${target}.metadata.json`, JSON.stringify({ contentType }));
}
export async function loadFile(key: string) {
  const target = filePath(key);
  return { bytes: await readFile(target), contentType: JSON.parse(await readFile(`${target}.metadata.json`, "utf8")).contentType };
}
export async function removeFile(key: string) { const target = filePath(key); await unlink(target); await unlink(`${target}.metadata.json`).catch(() => {}); }
